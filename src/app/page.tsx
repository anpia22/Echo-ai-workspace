"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import EchoCanvas, { type ViewportApi } from "./components/EchoCanvas";
import RoomControls from "./components/RoomControls";
import { applyCanvasActions } from "./lib/applyCanvasActions";
import { createCanvasSnapshot } from "./lib/collaboration/canvasSnapshot";
import type { ViewportState } from "./lib/collaboration/viewportEvents";
import {
  applyRemoteNodeEvent,
  diffLocalNodeMutations,
  moveSemanticNode,
  publishLocalNodeMutations,
} from "./lib/collaboration/nodeEvents";
import {
  applyRemoteEdgeEvent,
  diffLocalEdgeMutations,
  publishLocalEdgeMutations,
} from "./lib/collaboration/edgeEvents";
import {
  applyRemoteGroupEvent,
  diffLocalGroupMutations,
  publishLocalGroupMutations,
} from "./lib/collaboration/groupEvents";
import { getRoomIdFromUrl } from "./lib/collaboration/room";
import { useRoomChannel } from "./lib/collaboration/useRoomChannel";
import { useMeeting } from "./lib/collaboration/meeting";
import {
  createMeetingConversationStore,
  type MeetingConversationStore,
} from "./lib/collaboration/meeting/conversation";
import type {
  MeetingInsightRecord,
  MeetingTranscriptSegmentRecord,
} from "./lib/persistence/meetingTypes";
import { MeetingDock } from "./components/meeting";
import {
  buildGraphContext,
  logGraphContext,
} from "./lib/graphContext";
import {
  useWorkspaceHydration,
  useCanvasPersistence,
  useConversationPersistence,
  useMeetingPersistence,
  useRoomPersistence,
  useClientMigration,
  isWorkspaceMigrated,
  updateConversationTitleApi,
  updateConversationApi,
  loadConversationCanvasApi,
} from "./lib/persistence/client";
import type {
  CanvasPersistenceStatus,
  ConversationPersistenceStatus,
} from "./lib/persistence/client";

type CanvasAction = {
  type: string;

  nodeType?: string;
  title?: string;
  description?: string;

  sourceTitle?: string;
  targetTitle?: string;
  relationship?: string;

  nodeTitles?: string[];
  groupTitle?: string;
  position?: {
    x: number;
    y: number;
  };

  updates?: {
    title?: string;
    description?: string;
    nodeType?: string;
  };
};

type CanvasNode = {
  id: string;
  nodeType: string;
  title: string;
  description?: string;
  position: {
    x: number;
    y: number;
  };
};

type CanvasEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  relationship?: string;
};

type CanvasGroup = {
  id: string;
  title: string;
  memberIds: string[];
};

type CanvasState = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: CanvasGroup[];
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  actions?: CanvasAction[];
  canvas: CanvasState;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "echo-conversations";

function emptyCanvas(): CanvasState {
  return {
    nodes: [],
    edges: [],
    groups: [],
  };
}

function normalizeLoadedCanvas(
  canvas?: CanvasState | null
): CanvasState {
  if (!canvas) {
    return emptyCanvas();
  }
  const nodes: CanvasNode[] = Array.isArray(canvas.nodes)
    ? canvas.nodes
        .filter((node): node is CanvasNode => Boolean(node && typeof node === "object" && (node as any).id))
        .map((node: any) => ({
          id: String(node.id),
          nodeType: String(node.nodeType || "problem"),
          title: String(node.title || ""),
          description: node.description ? String(node.description) : undefined,
          position: {
            x: typeof node.position?.x === "number"
              ? node.position.x
              : typeof node.positionX === "number"
              ? node.positionX
              : 0,
            y: typeof node.position?.y === "number"
              ? node.position.y
              : typeof node.positionY === "number"
              ? node.positionY
              : 0,
          },
        }))
    : [];

  const edges: CanvasEdge[] = Array.isArray(canvas.edges)
    ? canvas.edges
        .filter((edge): edge is CanvasEdge => Boolean(edge && typeof edge === "object" && (edge as any).id))
        .map((edge: any) => ({
          id: String(edge.id),
          sourceId: String(edge.sourceId || edge.source || ""),
          targetId: String(edge.targetId || edge.target || ""),
          relationship: edge.relationship ? String(edge.relationship) : undefined,
        }))
    : [];

  const groups: CanvasGroup[] = Array.isArray(canvas.groups)
    ? canvas.groups
        .filter((group): group is CanvasGroup => Boolean(group && typeof group === "object" && (group as any).id))
        .map((group: any) => ({
          id: String(group.id),
          title: String(group.title || ""),
          memberIds: Array.isArray(group.memberIds)
            ? group.memberIds.map(String)
            : Array.isArray(group.members)
            ? group.members.map(String)
            : [],
        }))
    : [];

  return { nodes, edges, groups };
}

const DEFAULT_CONVERSATION_TITLE = "New Conversation";

function isPlaceholderTitle(title: string): boolean {
  return title.trim() === "" || title.trim() === DEFAULT_CONVERSATION_TITLE;
}

function generateConversationTitle(message: string): string {
  let text = message.trim().replace(/\s+/g, " ");

  const leadingFiller =
    /^(please\s+|hey[,.\s]+|hi[,.\s]+|hello[,.\s]+|can you\s+|could you\s+|would you\s+|i(?:'d| would)? like to\s+|i want to\s+|i need to\s+)/i;

  while (text && leadingFiller.test(text)) {
    text = text.replace(leadingFiller, "").trim();
  }

  const words = text
    .split(/\s+/)
    .map((word) =>
      word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    )
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return DEFAULT_CONVERSATION_TITLE;
  }

  const wordCount = words.length <= 6 ? words.length : 5;
  const title = words.slice(0, wordCount).join(" ");

  return title.charAt(0).toUpperCase() + title.slice(1);
}

function getConversationDisplayName(conversation: Conversation): string {
  if (conversation.title && !isPlaceholderTitle(conversation.title)) {
    return conversation.title;
  }
  const firstUserMessage = conversation.messages?.find((m) => m.role === "user");
  if (firstUserMessage?.content) {
    return generateConversationTitle(firstUserMessage.content);
  }
  return DEFAULT_CONVERSATION_TITLE;
}

function conversationMatchesSearch(
  conversation: Conversation,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return true;
  }

  const title = getConversationDisplayName(conversation).toLowerCase();
  if (title.includes(needle)) {
    return true;
  }

  return conversation.messages.some(
    (message) =>
      message.role === "user" &&
      message.content.toLowerCase().includes(needle)
  );
}

function formatRelativeTimestamp(
  isoString: string,
  now = new Date()
): string {
  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86400000
  );

  if (diffDays === 1) {
    return "Yesterday";
  }

  if (diffDays > 1 && diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function hasMeaningfulCanvasContent(canvas: CanvasState): boolean {
  if (canvas.edges.length > 0) {
    return true;
  }

  return canvas.nodes.some((node) => {
    const title = node.title.trim();
    const description = node.description?.trim() ?? "";

    return title.length > 0 || description.length > 0;
  });
}

function getConversationPreview(conversation: Conversation): string {
  for (
    let index = conversation.messages.length - 1;
    index >= 0;
    index -= 1
  ) {
    const content = conversation.messages[index].content
      .replace(/\s+/g, " ")
      .trim();

    if (content) {
      return content;
    }
  }

  return "";
}

function readStoredConversations(): Conversation[] {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return [];
  }

  const parsed = JSON.parse(saved);

  return Array.isArray(parsed) ? parsed : [];
}

function createConversation(): Conversation {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: DEFAULT_CONVERSATION_TITLE,
    messages: [],
    actions: [],
    canvas: emptyCanvas(),
    createdAt: now,
    updatedAt: now,
  };
}

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") {
    return null;
  }

  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };

  return (
    speechWindow.SpeechRecognition ||
    speechWindow.webkitSpeechRecognition ||
    null
  );
}

function getVoiceErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
      return "Microphone permission was denied. Allow microphone access to use voice input.";
    case "audio-capture":
      return "No microphone was detected.";
    case "network":
      return "Speech recognition could not connect. Check your internet connection.";
    case "no-speech":
      return "No speech was detected.";
    case "not-supported":
      return "Voice input isn't supported in this browser. Try Chrome or Edge.";
    case "aborted":
      return "Voice input stopped.";
    default:
      return "Voice input stopped.";
  }
}

// --------------------------------------------------
// Phase 14 — Unified System Status Badge
// --------------------------------------------------

function SystemStatusBadge({
  canvasStatus,
  conversationStatus,
}: {
  canvasStatus: CanvasPersistenceStatus;
  conversationStatus: ConversationPersistenceStatus;
}) {
  const isError = canvasStatus === "error" || conversationStatus === "error";
  const isConflict = canvasStatus === "conflict" || conversationStatus === "conflict";
  const isSaving = canvasStatus === "saving" || conversationStatus === "saving";
  const isSaved = canvasStatus === "saved" || conversationStatus === "saved";

  if (isError) {
    return (
      <div
        data-testid="system-persistence-error"
        className="flex cursor-default items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 px-2 py-1 text-xs text-rose-400"
        title="Save failed — changes may not be persisted"
        aria-label="System save error"
      >
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 2v4m0 2h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <span className="hidden sm:inline">Save Error</span>
      </div>
    );
  }

  if (isConflict) {
    return (
      <div
        data-testid="system-persistence-conflict"
        className="flex cursor-default items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 px-2 py-1 text-xs text-amber-400"
        title="Sync conflict detected"
        aria-label="System conflict"
      >
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 2v4m0 2h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <span className="hidden sm:inline">Conflict</span>
      </div>
    );
  }

  if (isSaving) {
    return (
      <div
        data-testid="system-persistence-saving"
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-zinc-400"
        title="Saving changes…"
        aria-label="Saving changes"
      >
        <span className="h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-zinc-300" />
        <span className="hidden sm:inline">Saving</span>
      </div>
    );
  }

  if (isSaved) {
    return (
      <div
        data-testid="system-persistence-saved"
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-emerald-400"
        title="All changes saved"
        aria-label="All changes saved"
      >
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="hidden sm:inline">Saved</span>
      </div>
    );
  }

  return null;
}

function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = getRoomIdFromUrl(searchParams);
  const rawWorkspaceParam = searchParams.get("workspace");
  const workspaceHydration = useWorkspaceHydration(rawWorkspaceParam);

  // --------------------------------------------------
  // Phase 13.5 — Canvas Persistence
  // --------------------------------------------------
  const [persistenceRevision, setPersistenceRevision] = useState<number | null>(null);

  const { persistenceStatus, persistCanvas, persistNodeMove } = useCanvasPersistence(
    workspaceHydration.workspaceId,
    persistenceRevision,
    (newRevision) => setPersistenceRevision(newRevision)
  );

  // --------------------------------------------------
  // Phase 13.6 — Conversation Persistence
  // --------------------------------------------------
  const {
    conversationPersistenceStatus,
    persistNewConversation,
    persistMessage,
    loadConversationMessages,
  } = useConversationPersistence(workspaceHydration.workspaceId);

  // --------------------------------------------------
  // Phase 13.7 — Meeting Persistence (Non-invasive)
  // --------------------------------------------------
  const meetingPersistence = useMeetingPersistence({
    workspaceId: workspaceHydration.workspaceId,
  });
  const activeMeetingIdRef = useRef<string | null>(null);
  const meetingConversationStoreRef = useRef<MeetingConversationStore | null>(null);
  const activeMeetingInsightsRef = useRef<MeetingInsightRecord[]>([]);

  // --------------------------------------------------
  // Phase 13.8 — Collaboration Room Persistence (Non-invasive & Guarded)
  // --------------------------------------------------
  const roomPersistence = useRoomPersistence({
    workspaceId: workspaceHydration.workspaceId,
  });
  const lastPersistedRoomRef = useRef<string | null>(null);

  // --------------------------------------------------
  // Phase 13.9 — Client Migration & Storage Cutover
  // --------------------------------------------------
  useClientMigration({
    workspaceId: workspaceHydration.workspaceId,
    enabled: workspaceHydration.status === "ready" && !!workspaceHydration.workspaceId,
    onMigrationComplete: useCallback(() => {
      workspaceHydration.retry();
    }, [workspaceHydration]),
  });

  const [transcript, setTranscript] = useState("");

  // Phase 14.2 Composer Focus
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        composerInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Phase 14 Layout States
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [isConversationOpen, setIsConversationOpen] = useState(true);

  const [canvas, setCanvas] = useState<CanvasState>(emptyCanvas);
  const canvasRef = useRef(canvas);
  const viewportRef = useRef<ViewportState>({ x: 0, y: 0, zoom: 1 });
  const viewportApiRef = useRef<ViewportApi | null>(null);

  const handleViewportChange = useCallback((viewport: ViewportState) => {
    viewportRef.current = viewport;
  }, []);

  const handleViewportInit = useCallback((api: ViewportApi) => {
    viewportApiRef.current = api;
  }, []);

  const [isLoaded, setIsLoaded] = useState(false);
  const remoteSnapshotAppliedRef = useRef(false);

  const followingUserIdRef = useRef<string | null>(null);

  const meetingHandleSignalRef = useRef<
    ((payload: unknown) => Promise<void>) | null
  >(null);

  const roomConnection = useRoomChannel(isLoaded ? roomId : null, {
    getSnapshot: () => createCanvasSnapshot(canvasRef.current),
    onRemoteSnapshot: (snapshot) => {
      remoteSnapshotAppliedRef.current = true;
      canvasRef.current = snapshot;
      setCanvas(snapshot);
    },
    onRemoteNodeEvent: (event) => {
      const next = applyRemoteNodeEvent(canvasRef.current, event);
      canvasRef.current = next;
      setCanvas(next);
    },
    onRemoteEdgeEvent: (event) => {
      const next = applyRemoteEdgeEvent(canvasRef.current, event);
      canvasRef.current = next;
      setCanvas(next);
    },
    onRemoteGroupEvent: (event) => {
      const next = applyRemoteGroupEvent(canvasRef.current, event);
      canvasRef.current = next;
      setCanvas(next);
    },
    onRemoteViewportUpdate: (event) => {
      // Unfollow / leader safety check at application time
      if (followingUserIdRef.current !== event.senderId) {
        return;
      }
      viewportApiRef.current?.applyRemoteViewport(event.viewport);
    },
    onMeetingSignal: (payload) => {
      void meetingHandleSignalRef.current?.(payload);
    },
  });

  const broadcastMeetingSignalRef = useRef(roomConnection.broadcastMeetingSignal);
  useEffect(() => {
    broadcastMeetingSignalRef.current = roomConnection.broadcastMeetingSignal;
  }, [roomConnection.broadcastMeetingSignal]);

  // Phase 13.8: Guarded non-blocking room persistence lifecycle
  useEffect(() => {
    if (!isLoaded || !workspaceHydration.workspaceId) {
      return;
    }

    if (roomId) {
      if (lastPersistedRoomRef.current !== roomId) {
        lastPersistedRoomRef.current = roomId;
        void roomPersistence.persistRoomStart(roomId, `Echo Room - ${roomId.slice(0, 8)}`);
      }
    } else if (lastPersistedRoomRef.current) {
      const prev = lastPersistedRoomRef.current;
      lastPersistedRoomRef.current = null;
      void roomPersistence.persistRoomClose(prev);
    }
  }, [isLoaded, roomId, workspaceHydration.workspaceId, roomPersistence]);

  const meeting = useMeeting({
    roomId: isLoaded ? roomId : null,
    userId: roomConnection.currentParticipant?.userId ?? null,
    displayName: roomConnection.currentParticipant?.displayName ?? "Guest",
    color: roomConnection.currentParticipant?.color ?? "#6366f1",
    broadcastSignal: (payload) => {
      broadcastMeetingSignalRef.current(payload);
    },
  });

  useEffect(() => {
    meetingHandleSignalRef.current = meeting.handleSignal;
  }, [meeting.handleSignal]);

  const handleStartMeeting = useCallback(async () => {
    const newMeetingId = crypto.randomUUID();
    activeMeetingIdRef.current = newMeetingId;

    // Phase 14.2 — Initialize scoped conversation store for meeting session
    const store = createMeetingConversationStore(newMeetingId);
    meetingConversationStoreRef.current = store;
    activeMeetingInsightsRef.current = [];

    // Expose on window for runtime STT/analysis pipelines and automated tests
    if (typeof window !== "undefined") {
      (window as unknown as { __echoMeetingConversationStore?: MeetingConversationStore | null }).__echoMeetingConversationStore = store;
    }

    // 1. Live meeting runtime starts immediately (Phase 12 untouched)
    await meeting.startMeeting();

    // 2. Asynchronously persist meeting start (non-blocking)
    void meetingPersistence.persistStart(
      newMeetingId,
      `Echo Meeting - ${new Date().toLocaleDateString()}`
    );
  }, [meeting, meetingPersistence]);

  const handleLeaveMeeting = useCallback(async () => {
    const endingMeetingId = activeMeetingIdRef.current;
    activeMeetingIdRef.current = null;

    const store = meetingConversationStoreRef.current;
    meetingConversationStoreRef.current = null;
    if (typeof window !== "undefined") {
      (window as unknown as { __echoMeetingConversationStore?: MeetingConversationStore | null }).__echoMeetingConversationStore = null;
    }

    // Phase 14.2 — Gather finalized segments and insights
    const finalizedSegments: MeetingTranscriptSegmentRecord[] = store
      ? (store.getFinalizedSegments() as unknown as MeetingTranscriptSegmentRecord[])
      : [];
    const finalizedInsights: MeetingInsightRecord[] = activeMeetingInsightsRef.current;
    activeMeetingInsightsRef.current = [];

    // 1. Live meeting runtime leaves immediately (Phase 12 untouched)
    await meeting.leaveMeeting();

    // 2. Asynchronously mark meeting as ended with finalized transcripts & insights
    if (endingMeetingId) {
      void meetingPersistence.persistEnd(
        endingMeetingId,
        undefined,
        finalizedSegments.length > 0 ? finalizedSegments : undefined,
        finalizedInsights.length > 0 ? finalizedInsights : undefined
      );
    }
  }, [meeting, meetingPersistence]);

  const { meeting: meetingDomainState, syncPeers: meetingSyncPeers } = meeting;

  useEffect(() => {
    if (meetingDomainState.status !== "in-meeting") return;

    void meetingSyncPeers(
      roomConnection.participants.map((participant) => ({
        userId: participant.userId,
        displayName: participant.displayName,
        color: participant.color,
      }))
    );
  }, [
    meetingDomainState.status,
    meetingSyncPeers,
    roomConnection.participants,
  ]);

  useEffect(() => {
    followingUserIdRef.current = roomConnection.followingUserId;
  }, [roomConnection.followingUserId]);

  const isLeader = Boolean(
    roomId &&
    roomConnection.state === "connected" &&
    roomConnection.followerUserIds.size > 0
  );

  const [followInterruptedNotice, setFollowInterruptedNotice] = useState<
    string | null
  >(null);
  const followInterruptedTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  useEffect(() => {
    return () => {
      if (followInterruptedTimerRef.current) {
        clearTimeout(followInterruptedTimerRef.current);
      }
    };
  }, []);

  const handleManualViewportChange = useCallback(() => {
    if (followingUserIdRef.current !== null) {
        roomConnection.unfollowUser();
        setFollowInterruptedNotice("Follow mode stopped");
        if (followInterruptedTimerRef.current) {
          clearTimeout(followInterruptedTimerRef.current);
        }
        followInterruptedTimerRef.current = setTimeout(() => {
          setFollowInterruptedNotice(null);
        }, 3000);
      }
    },
    [roomConnection]
  );

  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  useEffect(() => {
    console.log(
      "PAGE CANVAS STATE:",
      JSON.stringify(canvas, null, 2)
    );
  }, [canvas]);

  const [messages, setMessages] = useState<Message[]>([]);

  const [conversations, setConversations] =
    useState<Conversation[]>([]);

  const [conversationId, setConversationId] =
    useState<string | null>(null);

  const [conversationTitle, setConversationTitle] =
    useState("New Conversation");

  const SLOW_RESPONSE_MS = 8000;

  const [loading, setLoading] = useState(false);

  const [slowThinking, setSlowThinking] =
    useState(false);

  const [isListening, setIsListening] =
    useState(false);

  const [voiceFeedback, setVoiceFeedback] = useState<
    | { kind: "idle" }
    | { kind: "listening" }
    | { kind: "info"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const recognitionRef =
    useRef<SpeechRecognitionInstance | null>(null);

  const finalTranscriptRef =
    useRef("");

  const isMountedRef =
    useRef(true);

  const userStoppedRef =
    useRef(false);

  const speechReceivedRef =
    useRef(false);

  const voiceErrorShownRef =
    useRef(false);

  const skipAutosaveRef =
    useRef(false);

  const skipRenameCommitRef =
    useRef(false);

  const analyzeInFlightRef =
    useRef(false);

  // Authoritative conversation switch race protection & request generation token
  const canvasRequestGenerationRef =
    useRef(0);
  const activeConversationGenRef =
    canvasRequestGenerationRef;

  const activeConversationIdRef =
    useRef<string | null>(null);

  const currentWorkspaceIdRef =
    useRef<string | null>(null);

  const canvasOwnerConversationIdRef =
    useRef<string | null>(null);

  const canvasAbortControllerRef =
    useRef<AbortController | null>(null);

  const slowResponseTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  const [voiceLanguage, setVoiceLanguage] =
    useState("en-US");

  const [renamingConversationId, setRenamingConversationId] =
    useState<string | null>(null);

  const [renameDraft, setRenameDraft] =
    useState("");

  const [conversationSearch, setConversationSearch] =
    useState("");

  // --------------------------------------------------
  // Load saved conversation / Hydrate workspace
  // --------------------------------------------------

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Wait until workspace hydration completes
    if (workspaceHydration.status !== "ready") {
      return;
    }

    // Phase 13.5: Initialize persistence revision from hydrated workspace
    if (workspaceHydration.workspace?.revision != null) {
      setPersistenceRevision(workspaceHydration.workspace.revision);
    }

    // 1. If persisted workspace canvas exists and no conversations exist, hydrate it
    if (
      (!workspaceHydration.hydratedConversations || workspaceHydration.hydratedConversations.length === 0) &&
      workspaceHydration.hydratedCanvas &&
      hasMeaningfulCanvasContent(workspaceHydration.hydratedCanvas)
    ) {
      skipAutosaveRef.current = true;
      canvasRef.current = workspaceHydration.hydratedCanvas;
      setCanvas(workspaceHydration.hydratedCanvas);
    }

    // 2. Hydrate conversations with precedence:
    // If persisted conversations exist in workspace, hydrate them
    if (workspaceHydration.hydratedConversations && workspaceHydration.hydratedConversations.length > 0) {
      const normalizedConvs = workspaceHydration.hydratedConversations.map((conv) => ({
        ...conv,
        title: getConversationDisplayName(conv),
      }));

      setConversations(normalizedConvs);

      // Restore active conversation identity:
      // Priority 1: URL search parameter `conversation`
      // Priority 2: Stored active conversation in localStorage for this workspace
      // Priority 3: First conversation
      const urlConvId = searchParams.get("conversation");
      const storageKey = `echo_active_conv_${workspaceHydration.workspaceId}`;
      const storedConvId = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;

      const activeConv =
        (urlConvId && normalizedConvs.find((c) => c.id === urlConvId)) ||
        (storedConvId && normalizedConvs.find((c) => c.id === storedConvId)) ||
        normalizedConvs[0];

      activeConversationIdRef.current = activeConv.id;
      canvasOwnerConversationIdRef.current = activeConv.id;
      currentWorkspaceIdRef.current = workspaceHydration.workspaceId;
      setConversationId(activeConv.id);
      setConversationTitle(activeConv.title);

      // Hydrate messages for active conversation with request generation guard
      if (activeConv.messages && activeConv.messages.length > 0) {
        setMessages(activeConv.messages);
      } else {
        setMessages([]);
        if (workspaceHydration.workspaceId) {
          const currentGen = ++canvasRequestGenerationRef.current;
          const requestedConvId = activeConv.id;
          const requestedWsId = workspaceHydration.workspaceId;
          loadConversationMessages(activeConv.id, (loadedConvId, loadedMessages) => {
            if (
              currentGen !== canvasRequestGenerationRef.current ||
              loadedConvId !== activeConversationIdRef.current ||
              requestedWsId !== currentWorkspaceIdRef.current
            ) {
              return;
            }
            const mappedMsgs: Message[] = loadedMessages.map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              createdAt: m.createdAt,
            }));
            setMessages(mappedMsgs);
            setConversations((prevConvs) =>
              prevConvs.map((c) => {
                if (c.id !== loadedConvId) return c;
                const withMsgs = { ...c, messages: mappedMsgs };
                return { ...withMsgs, title: getConversationDisplayName(withMsgs) };
              })
            );
          });
        }
      }

      // Hydrate canvas: use conversation's isolated canvas; if empty, render a clean canvas!
      const targetCanvas = activeConv.canvas ? normalizeLoadedCanvas(activeConv.canvas) : emptyCanvas();

      canvasRef.current = targetCanvas;
      setCanvas(targetCanvas);

      // Persist active conversation identity to localStorage & URL without triggering full reload
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(storageKey, activeConv.id);
          const currentUrl = new URL(window.location.href);
          if (currentUrl.searchParams.get("conversation") !== activeConv.id) {
            currentUrl.searchParams.set("conversation", activeConv.id);
            window.history.replaceState({}, "", currentUrl.toString());
          }
        } catch {}
      }

      // If active conversation had a placeholder title in DB but has messages, persist the derived title
      if (
        workspaceHydration.workspaceId &&
        isPlaceholderTitle(activeConv.title) === false &&
        isPlaceholderTitle(workspaceHydration.hydratedConversations.find((c) => c.id === activeConv.id)?.title || "")
      ) {
        updateConversationTitleApi(
          workspaceHydration.workspaceId,
          activeConv.id,
          activeConv.title
        ).catch(console.error);
      }

      setIsLoaded(true);
      return;
    }

    // Fallback: Check local storage (Phase 13.4 non-destructive precedence)
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const savedConversations: Conversation[] =
          JSON.parse(saved);

        // Existing localStorage hydrate (Phase 9); keep this path unchanged.
        setConversations(
          savedConversations
        );

        if (savedConversations.length > 0) {
          const latestConversation =
            savedConversations[0];

          setConversationId(
            latestConversation.id
          );

          setConversationTitle(
            latestConversation.title
          );

          setMessages(
            latestConversation.messages || []
          );

          if (!remoteSnapshotAppliedRef.current && (!workspaceHydration.hydratedCanvas || !hasMeaningfulCanvasContent(workspaceHydration.hydratedCanvas))) {
            const next = normalizeLoadedCanvas(latestConversation.canvas);
            canvasRef.current = next;
            setCanvas(next);
          }

          setIsLoaded(true);
          return;
        }
      }

      // No conversation exists yet
      const newConversation =
        createConversation();

      setConversationId(newConversation.id);

      setConversationTitle(
        newConversation.title
      );

      setMessages([]);

      if (!hasMeaningfulCanvasContent(canvasRef.current)) {
        const initialEmpty = emptyCanvas();
        canvasRef.current = initialEmpty;
        setCanvas(initialEmpty);
      }

      setIsLoaded(true);

      // Phase 13.6: Persist newly initialized default conversation to backend (non-blocking)
      persistNewConversation({
        id: newConversation.id,
        title: newConversation.title,
      });
    } catch (error) {
      console.error(
        "Failed to load Echo conversation:",
        error
      );

      setIsLoaded(true);
    }
  }, [workspaceHydration.status, workspaceHydration.hydratedCanvas, workspaceHydration.hydratedConversations, workspaceHydration.workspace, persistNewConversation]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // --------------------------------------------------
  // Save conversation automatically
  // --------------------------------------------------

  useEffect(() => {
    if (!isLoaded || !conversationId) {
      return;
    }

    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }

    // STRICT SAVE RACE PROTECTION:
    // A save operation must be associated with the conversationId for which the canvas state was captured.
    const saveConversationId = activeConversationIdRef.current;
    if (!saveConversationId || saveConversationId !== conversationId) {
      return;
    }

    // Never save using a later/current conversationId if the snapshot was created for another conversation.
    // Do not allow: Conversation A nodes + Conversation B current ID = save A's nodes into B
    if (canvasOwnerConversationIdRef.current !== saveConversationId) {
      return;
    }

    const nodesSnapshot = canvas.nodes;
    const edgesSnapshot = canvas.edges;
    const groupsSnapshot = canvas.groups || [];
    const canvasSnapshot = {
      nodes: nodesSnapshot,
      edges: edgesSnapshot,
      groups: groupsSnapshot,
    };

    try {
      const now = new Date().toISOString();

      setConversations((prevConversations) => {
        // Double check saveConversationId is still active conversation
        if (activeConversationIdRef.current !== saveConversationId) {
          return prevConversations;
        }

        const existingConversation = prevConversations.find(
          (conversation) => conversation.id === saveConversationId
        );

        const updatedConversation: Conversation = {
          id: saveConversationId,
          title: conversationTitle,
          messages,
          actions: existingConversation?.actions || [],
          canvas: canvasSnapshot,
          createdAt: existingConversation?.createdAt || now,
          updatedAt: now,
        };

        const remainingConversations = prevConversations.filter(
          (conversation) => conversation.id !== saveConversationId
        );

        const updatedConversations = [
          updatedConversation,
          ...remainingConversations,
        ];

        // Phase 13.9 Cutover: If migrated to PostgreSQL for active workspace, skip localStorage write
        const isMigrated = isWorkspaceMigrated(workspaceHydration.workspaceId);
        if (!isMigrated) {
          try {
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify(updatedConversations)
            );
          } catch {
            // ignore
          }
        }

        return updatedConversations;
      });
    } catch (error) {
      console.error(
        "Failed to save Echo conversation:",
        error
      );
    }
  }, [
    canvas,
    messages,
    conversationId,
    conversationTitle,
    isLoaded,
    workspaceHydration.workspaceId,
  ]);

  const clearSlowResponseTimer = () => {
    if (slowResponseTimerRef.current !== null) {
      clearTimeout(slowResponseTimerRef.current);
      slowResponseTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (slowResponseTimerRef.current !== null) {
        clearTimeout(slowResponseTimerRef.current);
        slowResponseTimerRef.current = null;
      }
    };
  }, []);

  // --------------------------------------------------
  // Voice / speech-to-text (composer input only)
  // --------------------------------------------------

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      userStoppedRef.current = true;

      const recognition = recognitionRef.current;
      recognitionRef.current = null;

      if (recognition) {
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.stop();
      }
    };
  }, []);

  const stopRecognitionSession = () => {
    userStoppedRef.current = true;

    const recognition = recognitionRef.current;

    if (recognition) {
      recognition.stop();
    }

    setIsListening(false);
  };

  const toggleListening = () => {
    if (loading) {
      return;
    }

    if (isListening || recognitionRef.current) {
      stopRecognitionSession();
      return;
    }

    const SpeechRecognitionCtor =
      getSpeechRecognitionCtor();

    if (!SpeechRecognitionCtor) {
      setVoiceFeedback({
        kind: "error",
        message:
          "Voice input isn't supported in this browser. Try Chrome or Edge.",
      });

      return;
    }

    const recognition =
      new SpeechRecognitionCtor();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = voiceLanguage;

    userStoppedRef.current = false;
    speechReceivedRef.current = false;
    voiceErrorShownRef.current = false;

    // Preserve anything the user already typed
    finalTranscriptRef.current =
      transcript.trim();

    recognition.onstart = () => {
      console.log("🎙️ SPEECH onstart");

      if (!isMountedRef.current) {
        return;
      }

      setIsListening(true);
      setVoiceFeedback({ kind: "listening" });
    };

    recognition.onresult = (
      event: SpeechRecognitionEventLike
    ) => {
      console.log("🗣️ SPEECH onresult FIRED", event);

      if (!isMountedRef.current) {
        return;
      }

      let interimTranscript = "";

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        const result =
          event.results[i];

        console.log("📝 SPEECH result:", {
          index: i,
          isFinal: result.isFinal,
          transcript: result[0]?.transcript,
        });

        const text =
          result[0].transcript.trim();

        if (!text) {
          continue;
        }

        speechReceivedRef.current = true;

        if (result.isFinal) {
          // Save final speech only once
          finalTranscriptRef.current =
            `${finalTranscriptRef.current} ${text}`.trim();
        } else {
          // Temporary speech
          interimTranscript +=
            ` ${text}`;
        }
      }

      const finalText =
        finalTranscriptRef.current.trim();

      const interimText =
        interimTranscript.trim();

      console.log("📄 TRANSCRIPT UPDATE:", {
        finalText,
        interimText,
      });

      setTranscript(
        `${finalText} ${interimText}`.trim()
      );
    };

    recognition.onerror = (
      event: SpeechRecognitionErrorEventLike
    ) => {
      console.log("⚠️ SPEECH onerror:", event.error);

      const errorCode = event.error;

      if (!isMountedRef.current) {
        return;
      }

      // Chrome emits this when the user stayed silent.
      // It is not an application failure. Final UI is set in onend.
      if (errorCode === "no-speech") {
        setIsListening(false);
        return;
      }

      console.error(
        "Speech recognition error:",
        errorCode
      );

      setIsListening(false);

      if (
        errorCode === "aborted" &&
        userStoppedRef.current
      ) {
        return;
      }

      voiceErrorShownRef.current = true;

      setVoiceFeedback({
        kind: "error",
        message: getVoiceErrorMessage(errorCode),
      });
    };

    recognition.onend = () => {
      console.log("🛑 SPEECH onend", {
        speechReceived: speechReceivedRef.current,
        userStopped: userStoppedRef.current,
      });

      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }

      if (!isMountedRef.current) {
        return;
      }

      setIsListening(false);

      if (voiceErrorShownRef.current) {
        userStoppedRef.current = false;
        return;
      }

      if (
        !speechReceivedRef.current &&
        !userStoppedRef.current
      ) {
        setVoiceFeedback({
          kind: "info",
          message: "No speech was detected.",
        });
      } else {
        setVoiceFeedback({
          kind: "idle",
        });
      }

      userStoppedRef.current = false;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (error) {
      console.error(
        "Speech recognition failed to start:",
        error
      );

      recognitionRef.current = null;
      setIsListening(false);
      setVoiceFeedback({
        kind: "error",
        message: getVoiceErrorMessage("not-supported"),
      });
    }
  };

  // --------------------------------------------------
  // create new conversation
  // --------------------------------------------------

  const createNewConversation = () => {
    try {
      const now = new Date().toISOString();
      const prevConvId = activeConversationIdRef.current;
      const prevOwned = prevConvId && canvasOwnerConversationIdRef.current === prevConvId;
      const prevCanvasSnapshot = canvasRef.current;

      // 1. Abort any in-flight canvas request
      if (canvasAbortControllerRef.current) {
        canvasAbortControllerRef.current.abort();
        canvasAbortControllerRef.current = null;
      }

      // 2. Invalidate request generation/token
      const generation = ++canvasRequestGenerationRef.current;

      const newConversation = createConversation();
      const newConvId = newConversation.id;

      // 3. Clear transient canvas state and set active conversation ID
      activeConversationIdRef.current = newConvId;
      canvasOwnerConversationIdRef.current = newConvId;
      currentWorkspaceIdRef.current = workspaceHydration.workspaceId;

      // 4 & 5. Clear visible canvas immediately
      skipAutosaveRef.current = true;
      canvasRef.current = emptyCanvas();
      setCanvas(emptyCanvas());
      setMessages([]);
      setTranscript("");
      setRenamingConversationId(null);

      setConversationId(newConvId);
      setConversationTitle(newConversation.title);

      // Flush previous conversation canvas snapshot safely (associated strictly with previous conversation ID)
      setConversations((prevConversations) => {
        let baseConversations = prevConversations;
        if (prevConvId && prevOwned) {
          baseConversations = prevConversations.map((c) =>
            c.id === prevConvId ? { ...c, canvas: prevCanvasSnapshot } : c
          );
        }
        const nextConversations = [newConversation, ...baseConversations];
        if (!isWorkspaceMigrated(workspaceHydration.workspaceId)) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConversations));
          } catch {}
        }
        return nextConversations;
      });

      // Sync active conversation identity to localStorage & URL
      if (typeof window !== "undefined" && workspaceHydration.workspaceId) {
        try {
          localStorage.setItem(`echo_active_conv_${workspaceHydration.workspaceId}`, newConvId);
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set("conversation", newConvId);
          window.history.replaceState({}, "", currentUrl.toString());
        } catch {}
      }

      // Phase 13.6: persist new conversation to backend (non-blocking)
      persistNewConversation({
        id: newConversation.id,
        title: newConversation.title,
      });
    } catch (error) {
      console.error(
        "Failed to create new Echo conversation:",
        error
      );
    }
  };

  // --------------------------------------------------
  // switch conversation
  // --------------------------------------------------

  const switchConversation = (
    selectedConversation: Conversation
  ) => {
    // 1. Flush active conversation's current canvas to in-memory conversations state
    // strictly associated with previous conversation ID
    const prevConvId = activeConversationIdRef.current;
    if (prevConvId && canvasOwnerConversationIdRef.current === prevConvId) {
      const prevCanvasSnapshot = canvasRef.current;
      setConversations((prev) =>
        prev.map((c) => (c.id === prevConvId ? { ...c, canvas: prevCanvasSnapshot } : c))
      );
    }

    // 2. Abort any in-flight canvas request for previous conversation
    if (canvasAbortControllerRef.current) {
      canvasAbortControllerRef.current.abort();
      canvasAbortControllerRef.current = null;
    }

    // 3. Invalidate previous request generation/token
    const generation = ++canvasRequestGenerationRef.current;

    // 4. Capture target conversation and workspace IDs
    const targetConvId = selectedConversation.id;
    const currentWorkspaceId = workspaceHydration.workspaceId;
    activeConversationIdRef.current = targetConvId;
    canvasOwnerConversationIdRef.current = targetConvId;
    currentWorkspaceIdRef.current = currentWorkspaceId;

    // 5. Clear visible canvas & transient UI state immediately
    skipAutosaveRef.current = true;
    canvasRef.current = emptyCanvas();
    setCanvas(emptyCanvas());
    setMessages([]);
    setTranscript("");
    setRenamingConversationId(null);

    // 6. Update active conversation ID and title in UI
    setConversationId(targetConvId);
    const displayName = getConversationDisplayName(selectedConversation);
    setConversationTitle(displayName);

    // Sync active conversation identity to localStorage & URL
    if (typeof window !== "undefined" && currentWorkspaceId) {
      try {
        localStorage.setItem(`echo_active_conv_${currentWorkspaceId}`, targetConvId);
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get("conversation") !== targetConvId) {
          currentUrl.searchParams.set("conversation", targetConvId);
          window.history.replaceState({}, "", currentUrl.toString());
        }
      } catch {}
    }

    // 7. Load target conversation's canvas:
    // First, if selectedConversation already has a non-empty canvas in memory, apply it optimistically
    if (
      selectedConversation.canvas &&
      (selectedConversation.canvas.nodes.length > 0 || selectedConversation.canvas.edges.length > 0)
    ) {
      const localCanvas = normalizeLoadedCanvas(selectedConversation.canvas);
      canvasRef.current = localCanvas;
      setCanvas(localCanvas);
    }

    // Start async load from server with AbortController and strict stale-request protection
    if (currentWorkspaceId) {
      const controller = new AbortController();
      canvasAbortControllerRef.current = controller;
      const requestedWorkspaceId = currentWorkspaceId;
      const requestedConversationId = targetConvId;

      loadConversationCanvasApi(requestedWorkspaceId, requestedConversationId, {
        signal: controller.signal,
      })
        .then((result) => {
          // STRICT STALE-REQUEST PROTECTION:
          // 4. Before applying the response, verify:
          //    requestedWorkspaceId === currentWorkspaceId
          //    &&
          //    requestedConversationId === activeConversationId
          //    &&
          //    generation === canvasRequestGenerationRef.current
          if (
            controller.signal.aborted ||
            generation !== canvasRequestGenerationRef.current ||
            requestedConversationId !== activeConversationIdRef.current ||
            requestedWorkspaceId !== currentWorkspaceIdRef.current
          ) {
            // 5. If either does not match, discard the response completely.
            return;
          }

          // 6. Never call setNodes/setEdges/setCanvasState for a stale conversation response.
          const loadedCanvas = normalizeLoadedCanvas(result);
          canvasRef.current = loadedCanvas;
          canvasOwnerConversationIdRef.current = requestedConversationId;
          setCanvas(loadedCanvas);

          setConversations((prev) =>
            prev.map((c) =>
              c.id === requestedConversationId ? { ...c, canvas: loadedCanvas } : c
            )
          );
        })
        .catch((err) => {
          if (
            controller.signal.aborted ||
            generation !== canvasRequestGenerationRef.current ||
            requestedConversationId !== activeConversationIdRef.current ||
            requestedWorkspaceId !== currentWorkspaceIdRef.current
          ) {
            return;
          }
          if (err?.name === "AbortError") {
            return;
          }
          console.warn("[switchConversation] Failed to load remote canvas:", err);
        });
    }

    // 8. Load target conversation's messages
    if (selectedConversation.messages && selectedConversation.messages.length > 0) {
      setMessages(selectedConversation.messages);
    } else if (currentWorkspaceId) {
      loadConversationMessages(targetConvId, (loadedConvId, loadedMessages) => {
        // Strict race-condition guard: drop delayed response if user already switched
        if (
          generation !== canvasRequestGenerationRef.current ||
          loadedConvId !== activeConversationIdRef.current ||
          currentWorkspaceId !== currentWorkspaceIdRef.current
        ) {
          return;
        }

        const mappedMsgs: Message[] = loadedMessages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: m.createdAt,
        }));
        setMessages(mappedMsgs);

        // Derive title from newly loaded messages if currently placeholder
        let currentTitle = selectedConversation.title;
        const firstUser = mappedMsgs.find((m) => m.role === "user");
        if (isPlaceholderTitle(currentTitle) && firstUser?.content) {
          const derived = generateConversationTitle(firstUser.content);
          if (!isPlaceholderTitle(derived)) {
            currentTitle = derived;
            setConversationTitle(derived);
            if (currentWorkspaceId) {
              updateConversationTitleApi(currentWorkspaceId, loadedConvId, derived).catch((err) => {
                console.error("Failed to update conversation title:", err);
              });
            }
          }
        }

        setConversations((prevConvs) =>
          prevConvs.map((c) =>
            c.id === loadedConvId ? { ...c, title: currentTitle, messages: mappedMsgs } : c
          )
        );
      });
    }
  };

  // --------------------------------------------------
  // rename conversation
  // --------------------------------------------------

  const startRenamingConversation = (
    conversation: Conversation
  ) => {
    setRenamingConversationId(conversation.id);
    setRenameDraft(getConversationDisplayName(conversation));
  };

  const cancelRenamingConversation = () => {
    skipRenameCommitRef.current = true;
    setRenamingConversationId(null);
    setRenameDraft("");
  };

  const commitRenamingConversation = (
    targetId: string
  ) => {
    if (skipRenameCommitRef.current) {
      skipRenameCommitRef.current = false;
      return;
    }

    const nextTitle = renameDraft.trim();

    setRenamingConversationId(null);
    setRenameDraft("");

    if (!nextTitle) {
      return;
    }

    try {
      setConversations((prevConversations) => {
        const updatedConversations = prevConversations.map((conversation) =>
          conversation.id === targetId
            ? {
                ...conversation,
                title: nextTitle,
              }
            : conversation
        );

        if (!isWorkspaceMigrated(workspaceHydration.workspaceId)) {
          try {
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify(updatedConversations)
            );
          } catch {}
        }

        return updatedConversations;
      });

      if (targetId === conversationId) {
        setConversationTitle(nextTitle);
      }

      // Persist renamed title to backend
      if (workspaceHydration.workspaceId) {
        updateConversationTitleApi(
          workspaceHydration.workspaceId,
          targetId,
          nextTitle
        ).catch((err) => {
          console.error("Failed to persist renamed conversation title:", err);
        });
      }
    } catch (error) {
      console.error(
        "Failed to rename Echo conversation:",
        error
      );
    }
  };

  // --------------------------------------------------
  // delete conversation
  // --------------------------------------------------

  const deleteConversation = (
    targetId: string
  ) => {
    const targetConversation =
      conversations.find(
        (conversation) =>
          conversation.id === targetId
      );

    const confirmed = window.confirm(
      `Delete "${targetConversation?.title || DEFAULT_CONVERSATION_TITLE}"? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      const remainingConversations = conversations.filter(
        (conversation) => conversation.id !== targetId
      );

      if (!isWorkspaceMigrated(workspaceHydration.workspaceId)) {
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(remainingConversations)
          );
        } catch {}
      }

      if (targetId === conversationId) {
        skipAutosaveRef.current = true;
        if (canvasAbortControllerRef.current) {
          canvasAbortControllerRef.current.abort();
          canvasAbortControllerRef.current = null;
        }
        ++canvasRequestGenerationRef.current;

        if (remainingConversations.length > 0) {
          const nextConversation =
            remainingConversations[0];

          activeConversationIdRef.current = nextConversation.id;
          canvasOwnerConversationIdRef.current = nextConversation.id;

          setConversations(
            remainingConversations
          );

          setConversationId(
            nextConversation.id
          );

          setConversationTitle(
            nextConversation.title
          );

          setMessages(
            nextConversation.messages || []
          );

          const next = normalizeLoadedCanvas(nextConversation.canvas);
          canvasRef.current = next;
          setCanvas(next);

          setTranscript("");
          setRenamingConversationId(null);
          return;
        }

        const newConversation =
          createConversation();

        activeConversationIdRef.current = newConversation.id;
        canvasOwnerConversationIdRef.current = newConversation.id;

        const nextConversations = [
          newConversation,
        ];

        setConversations(nextConversations);

        setConversationId(newConversation.id);

        setConversationTitle(
          newConversation.title
        );

        setMessages([]);

        const nextEmpty = emptyCanvas();
        canvasRef.current = nextEmpty;
        setCanvas(nextEmpty);

        setTranscript("");
        setRenamingConversationId(null);

        // Phase 13.6: persist new fallback conversation to backend (non-blocking)
        persistNewConversation({
          id: newConversation.id,
          title: newConversation.title,
        });
        return;
      }

      setConversations(remainingConversations);

      if (renamingConversationId === targetId) {
        setRenamingConversationId(null);
      }
    } catch (error) {
      console.error(
        "Failed to delete Echo conversation:",
        error
      );
    }
  };

  // --------------------------------------------------
  // update node position on drag
  // --------------------------------------------------

  const updateNodePosition = (
    nodeId: string,
    position: {
      x: number;
      y: number;
    }
  ) => {
    // Save race protection: capture saveConversationId and workspaceId at snapshot time
    const saveConversationId = activeConversationIdRef.current;
    const currentWorkspaceId = currentWorkspaceIdRef.current;

    const currentCanvas = canvasRef.current;
    const nextCanvas = moveSemanticNode(currentCanvas, nodeId, position);
    if (nextCanvas !== currentCanvas) {
      canvasRef.current = nextCanvas;
      if (saveConversationId) {
        canvasOwnerConversationIdRef.current = saveConversationId;
      }
      setCanvas(nextCanvas);
      roomConnection.broadcastNodeMoved(nodeId, position);
      // Phase 13.5: persist drag-end position (called only at drag-end by EchoCanvas)
      const movedNode = nextCanvas.nodes.find((n) => n.id === nodeId);
      if (movedNode) {
        persistNodeMove(movedNode);
      }
      if (saveConversationId && currentWorkspaceId) {
        setConversations((prev) =>
          prev.map((c) => (c.id === saveConversationId ? { ...c, canvas: nextCanvas } : c))
        );
        updateConversationApi(currentWorkspaceId, saveConversationId, {
          metadata: { canvas: nextCanvas },
        })
          .then(() => {
            // After save completion, do not update UI state unless the saved conversation is still the active conversation.
            if (
              saveConversationId !== activeConversationIdRef.current ||
              currentWorkspaceId !== currentWorkspaceIdRef.current
            ) {
              return;
            }
          })
          .catch((err) => {
            console.error("Failed to persist conversation canvas on move:", err);
          });
      }
    }
  };


  // --------------------------------------------------
  // Analyze transcript
  // --------------------------------------------------

  const analyzeTranscript = async () => {
    if (!transcript.trim()) return;

    if (analyzeInFlightRef.current || loading) {
      return;
    }

    const requestConversationId = activeConversationIdRef.current;
    const requestWorkspaceId = currentWorkspaceIdRef.current;
    const requestGen = canvasRequestGenerationRef.current;

    if (!requestConversationId || !requestWorkspaceId) {
      return;
    }

    analyzeInFlightRef.current = true;

    const userMessage = transcript.trim();

    // Add user message to conversation
    const newUserMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
      createdAt:
        new Date().toISOString(),
    };

    setMessages((currentMessages) => [
      ...currentMessages,
      newUserMessage,
    ]);

    let activeTitle = conversationTitle;
    const hasUserMessage = messages.some(
      (message) => message.role === "user"
    );

    if (
      isPlaceholderTitle(conversationTitle) &&
      !hasUserMessage
    ) {
      const generatedTitle =
        generateConversationTitle(userMessage);

      if (!isPlaceholderTitle(generatedTitle)) {
        activeTitle = generatedTitle;
        setConversationTitle(generatedTitle);

        setConversations((prev) =>
          prev.map((c) =>
            c.id === requestConversationId ? { ...c, title: generatedTitle } : c
          )
        );

        updateConversationTitleApi(
          requestWorkspaceId,
          requestConversationId,
          generatedTitle
        ).catch((err) => {
          console.error("Failed to persist generated conversation title:", err);
        });
      }
    }

    // Phase 13.6: Persist user message to backend (non-blocking)
    persistMessage(requestConversationId, newUserMessage, activeTitle);

    setSlowThinking(false);
    setLoading(true);
    setVoiceFeedback((prev) => (prev.kind === "listening" ? prev : { kind: "idle" }));
    clearSlowResponseTimer();
    slowResponseTimerRef.current = setTimeout(() => {
      slowResponseTimerRef.current = null;

      if (
        !isMountedRef.current ||
        !analyzeInFlightRef.current
      ) {
        return;
      }

      setSlowThinking(true);
    }, SLOW_RESPONSE_MS);

    try {
      const startTime = performance.now();

      console.log("🚀 Sending request to Echo...");

      const graphContext = buildGraphContext(
        canvas.nodes,
        canvas.edges
      );
      logGraphContext(graphContext);

      const response = await fetch(
        "/api/analyze",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            transcript: userMessage,

            workspaceId: requestWorkspaceId,
            meetingId: activeMeetingIdRef.current || undefined,

            conversationHistory: [
              ...messages,
              newUserMessage,
            ]
              .slice(-4)
              .map((message) => ({
                role: message.role,
                content: message.content,
              })),

            currentCanvas: canvas,
            graphContext,
          }),
        }
      );

      console.log(
        "⏱️ Fetch completed in:",
        ((performance.now() - startTime) / 1000).toFixed(2),
        "seconds"
      );

      const responseReceivedAt = performance.now();

      const data =
        await response.json();

      const responseJsonMs =
        performance.now() - responseReceivedAt;

      if (!response.ok) {
        console.error("❌ ANALYZE ERROR:", data);
        setVoiceFeedback({
          kind: "error",
          message: typeof data?.error === "string" ? data.error : "Echo couldn't process this request. Please try again.",
        });
        return;
      }

      // STRICT STALE-REQUEST PROTECTION:
      // Verify workspace, conversation, and generation token before applying response
      if (
        requestConversationId !== activeConversationIdRef.current ||
        requestWorkspaceId !== currentWorkspaceIdRef.current ||
        requestGen !== canvasRequestGenerationRef.current
      ) {
        console.warn("[analyzeTranscript] Discarding AI response for stale conversation", {
          requestConversationId,
          activeConversationId: activeConversationIdRef.current,
        });
        return;
      }

      console.log(
        "Echo AI:",
        data
      );

      console.log(
        "AI ACTIONS:",
        JSON.stringify(data.actions, null, 2)
      );

      if (process.env.NODE_ENV !== "production") {
        console.log(
          "[ECHO LATENCY] frontend_response_received:",
          `${Math.round((responseReceivedAt - startTime) * 100) / 100} ms`
        );
        console.log(
          "[ECHO LATENCY] response_json_parse:",
          `${Math.round(responseJsonMs * 100) / 100} ms`
        );
        if (data._echoLatency) {
          console.log(
            "[ECHO LATENCY] server breakdown:",
            data._echoLatency
          );
        }
      }

      if (Array.isArray(data.actions)) {
        // Capture prevCanvas BEFORE mutation — needed by canvasActionMapper for ID derivation
        const currentCanvas = canvasRef.current;
        const applyStart = performance.now();
        const nextCanvas = applyCanvasActions(
          currentCanvas,
          data.actions
        );
        const nodeMutations = diffLocalNodeMutations(
          currentCanvas,
          nextCanvas
        );
        const edgeMutations = diffLocalEdgeMutations(
          currentCanvas,
          nextCanvas
        );
        const groupMutations = diffLocalGroupMutations(
          currentCanvas,
          nextCanvas
        );

        if (process.env.NODE_ENV !== "production") {
          console.log(
            "[ECHO LATENCY] applyCanvasActions:",
            `${Math.round((performance.now() - applyStart) * 100) / 100} ms`
          );
        }

        canvasRef.current = nextCanvas;
        canvasOwnerConversationIdRef.current = requestConversationId;
        setCanvas(nextCanvas);

        publishLocalNodeMutations(nodeMutations, roomConnection);
        publishLocalEdgeMutations(edgeMutations, roomConnection);
        publishLocalGroupMutations(groupMutations, roomConnection);

        // Phase 13.5: persist canvas mutation (non-blocking, after runtime state committed)
        if (data.actions.length > 0) {
          persistCanvas(data.actions as Parameters<typeof persistCanvas>[0], currentCanvas, nextCanvas);
        }

        // Persist canvas to active conversation strictly associated with saveConversationId
        const saveConversationId = requestConversationId;
        setConversations((prev) =>
          prev.map((c) => (c.id === saveConversationId ? { ...c, canvas: nextCanvas } : c))
        );
        updateConversationApi(requestWorkspaceId, saveConversationId, {
          metadata: { canvas: nextCanvas },
        })
          .then(() => {
            if (
              saveConversationId !== activeConversationIdRef.current ||
              requestWorkspaceId !== currentWorkspaceIdRef.current
            ) {
              return;
            }
          })
          .catch((err) => {
            console.error("Failed to persist conversation canvas:", err);
          });

        if (process.env.NODE_ENV !== "production") {
          const paintStart = performance.now();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              console.log(
                "[ECHO LATENCY] canvas_state_update:",
                `${Math.round((performance.now() - paintStart) * 100) / 100} ms (2 rAF after setCanvas)`
              );
            });
          });
        }
      }

      // Save AI response in conversation
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          typeof data.message === "string"
            ? data.message
            : "Echo processed your request.",
        createdAt:
          new Date().toISOString(),
      };

      setMessages(
        (currentMessages) => [
          ...currentMessages,
          assistantMessage,
        ]
      );

      // Phase 13.6: Persist assistant message to backend (non-blocking)
      persistMessage(requestConversationId, assistantMessage, activeTitle);

      if (Array.isArray(data.actions) && data.actions.length > 0) {
        setVoiceFeedback({
          kind: "info",
          message: `Canvas updated (${data.actions.length} action${data.actions.length > 1 ? "s" : ""})`,
        });
        setTimeout(() => {
          if (isMountedRef.current) {
            setVoiceFeedback((prev) => (prev.kind === "info" ? { kind: "idle" } : prev));
          }
        }, 4000);
      }

      setTranscript("");
    } catch (error) {
      console.error(error);
      setVoiceFeedback({
        kind: "error",
        message: "Connection issue. Please check your network and try again.",
      });
    } finally {
      analyzeInFlightRef.current = false;
      clearSlowResponseTimer();

      if (isMountedRef.current) {
        setSlowThinking(false);
        setLoading(false);
      }
    }
  };

  const sortedConversations = [...conversations].sort(
    (left, right) => {
      const leftTime = Date.parse(left.updatedAt) || 0;
      const rightTime = Date.parse(right.updatedAt) || 0;
      return rightTime - leftTime;
    }
  );

  const filteredConversations = sortedConversations.filter(
    (conversation) =>
      conversationMatchesSearch(
        conversation,
        conversationSearch
      )
  );

  const isEmptyWorkspace =
    messages.length === 0 &&
    !hasMeaningfulCanvasContent(canvas);

  if (workspaceHydration.status === "loading") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="text-sm font-medium text-zinc-400">Loading Echo Workspace…</p>
        </div>
      </div>
    );
  }

  if (workspaceHydration.status === "error") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 p-6 text-white">
        <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-center backdrop-blur">
          <div className="mb-3 text-3xl">⚠️</div>
          <h2 className="text-lg font-semibold text-zinc-100">
            {workspaceHydration.error?.status === 404
              ? "Workspace Not Found"
              : workspaceHydration.error?.status === 403
                ? "Access Forbidden"
                : "Workspace Error"}
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            {workspaceHydration.error?.message || "Failed to load workspace."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => workspaceHydration.retry()}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700"
            >
              Retry
            </button>
            <button
              onClick={() => {
                router.push("/");
              }}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200"
            >
              New Workspace
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-zinc-950 text-white">
      <div className="flex h-full min-w-0 flex-col">

        {/* Header */}

        <header className="flex h-16 min-w-0 items-center justify-between border-b border-zinc-800 px-3 sm:px-6">

          <div className="flex min-w-0 items-center gap-2 sm:gap-4 pr-1 sm:pr-4">
            <button
              onClick={() => setIsHistoryOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
              title="Toggle History"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            <div className="min-w-0 max-w-[95px] sm:max-w-xs">
              <h1 className="text-lg sm:text-xl font-semibold">
                Echo
              </h1>

              <p
                className="truncate text-xs text-zinc-500"
                title={conversationTitle}
              >
                {workspaceHydration.workspace?.title ? `${workspaceHydration.workspace.title} • ` : ""}{conversationTitle}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">

            {/* Unified System Status Badge */}
            <SystemStatusBadge 
              canvasStatus={persistenceStatus} 
              conversationStatus={conversationPersistenceStatus} 
            />

            <RoomControls
              connection={roomConnection}
              followInterruptedNotice={followInterruptedNotice}
            />

            {meeting.meeting.status === "in-meeting" ? (
              <div
                data-testid="header-meeting-badge"
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-indigo-500/40 bg-indigo-950/40 px-2 sm:px-2.5 py-1 text-xs text-indigo-300"
                title={`${1 + meeting.meeting.participants.size} in meeting`}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-medium whitespace-nowrap">
                  In Meeting
                </span>
              </div>
            ) : null}

            {loading ? (
              <div
                data-testid="header-ai-status"
                className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-950/40 px-2.5 py-1 text-xs text-amber-300 transition-all"
                title="Echo is processing your request"
              >
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="font-medium">
                  {slowThinking ? "Echo Reasoning…" : "Echo Thinking…"}
                </span>
              </div>
            ) : isListening ? (
              <div
                data-testid="header-ai-status"
                className="flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-950/40 px-2.5 py-1 text-xs text-red-300 transition-all"
                title="Listening to your microphone"
              >
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-medium">Listening…</span>
              </div>
            ) : (
              <div
                data-testid="header-ai-status"
                className="flex items-center gap-1.5 text-xs text-zinc-400"
                title="Echo AI is ready"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="hidden sm:inline">AI Ready</span>
              </div>
            )}

            <button
              onClick={() => setIsConversationOpen((v) => !v)}
              className="ml-2 flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
              title="Toggle Conversation"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

          </div>

        </header>

        {/* Workspace */}

        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">

          {/* History Sidebar */}

          <aside className={`flex shrink-0 flex-col overflow-hidden bg-zinc-950 transition-all duration-300 ${isHistoryOpen ? "absolute inset-y-0 left-0 z-40 w-64 md:static md:z-auto border-r border-zinc-800 shadow-2xl md:shadow-none" : "w-0 border-r-0"}`}>
            <div className="flex h-full w-64 flex-col">
              <div className="border-b border-zinc-800 p-4">

              <input
                type="search"
                value={conversationSearch}
                onChange={(event) =>
                  setConversationSearch(
                    event.target.value
                  )
                }
                placeholder="Search conversations..."
                className="mb-3 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
              />

              <button
                onClick={createNewConversation}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800"
              >
                New Conversation
              </button>

            </div>

            {/* Conversation List */}

            <div className="flex-1 overflow-y-auto p-3">

              <div className="mb-3 px-2 text-xs font-medium uppercase tracking-wider text-zinc-600">
                Conversations
              </div>

              {conversations.length === 0 ? (
                <div className="px-2 py-8 text-center text-sm text-zinc-600">
                  No conversations yet.
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="px-2 py-8 text-center text-sm text-zinc-600">
                  No conversations found
                </div>
              ) : (
                <div className="space-y-1">

                  {filteredConversations.map(
                    (conversation) => {
                      const preview =
                        getConversationPreview(
                          conversation
                        );

                      return (
                      <div
                        key={conversation.id}
                        className={`min-w-0 overflow-hidden rounded-lg border-l-2 px-3 py-3 transition ${conversation.id ===
                          conversationId
                          ? "border-zinc-200 bg-zinc-800"
                          : "border-transparent hover:bg-zinc-900"
                          }`}
                      >

                        {renamingConversationId ===
                        conversation.id ? (
                          <input
                            autoFocus
                            value={renameDraft}
                            onChange={(event) =>
                              setRenameDraft(
                                event.target.value
                              )
                            }
                            onClick={(event) =>
                              event.stopPropagation()
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitRenamingConversation(
                                  conversation.id
                                );
                              }

                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelRenamingConversation();
                              }
                            }}
                            onBlur={() =>
                              commitRenamingConversation(
                                conversation.id
                              )
                            }
                            className="w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200 outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            title={getConversationDisplayName(conversation)}
                            aria-label={getConversationDisplayName(conversation)}
                            onClick={() =>
                              switchConversation(
                                conversation
                              )
                            }
                            className="block w-full min-w-0 truncate text-left text-sm font-medium text-zinc-200"
                          >
                            {getConversationDisplayName(conversation)}
                          </button>
                        )}

                        {preview ? (
                          <p
                            className="mt-1 truncate text-xs text-zinc-500"
                            title={preview}
                          >
                            {preview}
                          </p>
                        ) : null}

                        <div className="mt-2 flex items-center justify-between gap-2">

                          <div className="text-xs text-zinc-500">
                            {formatRelativeTimestamp(
                              conversation.updatedAt
                            )}
                          </div>

                          <div className="flex items-center gap-2">

                            <button
                              type="button"
                              title="Rename conversation"
                              onClick={(event) => {
                                event.stopPropagation();
                                startRenamingConversation(
                                  conversation
                                );
                              }}
                              className="text-xs text-zinc-500 transition hover:text-zinc-200"
                            >
                              Rename
                            </button>

                            <button
                              type="button"
                              title="Delete conversation"
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteConversation(
                                  conversation.id
                                );
                              }}
                              className="text-xs text-zinc-500 transition hover:text-red-400"
                            >
                              Delete
                            </button>

                          </div>

                        </div>

                      </div>
                      );
                    }
                  )}

                </div>
              )}

            </div>
            </div>

          </aside>

          {/* Main Workspace (Canvas Viewport + Composer Dock) */}

          <main
            data-testid="main-workspace"
            className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          >

            {/* Canvas Viewport */}

            <div
              data-testid="canvas-viewport"
              className="relative min-h-0 min-w-0 flex-1 w-full overflow-hidden"
            >

              <EchoCanvas
                roomId={roomId}
                canvas={canvas}
                onNodePositionChange={
                  updateNodePosition
                }
                remoteCursors={roomConnection.remoteCursors}
                participants={roomConnection.participants}
                onCursorMove={
                  roomId ? roomConnection.broadcastCursorMove : undefined
                }
                onViewportChange={handleViewportChange}
                onViewportInit={handleViewportInit}
                isLeader={isLeader}
                onViewportBroadcast={
                  roomId ? roomConnection.publishViewportUpdate : undefined
                }
                onManualViewportChange={handleManualViewportChange}
              />

              {/* Floating AI Status Pill (Phase 15.2) */}
              {loading ? (
                <div
                  data-testid="canvas-ai-status"
                  className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 rounded-full border border-indigo-500/40 bg-zinc-950/85 px-4 py-1.5 shadow-2xl backdrop-blur-md transition-all duration-300"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500"></span>
                  </span>
                  <span className="text-xs font-medium text-zinc-200">
                    {slowThinking ? "Echo is reasoning deeply…" : "Echo is analyzing…"}
                  </span>
                </div>
              ) : null}

              {isEmptyWorkspace ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-8">
                  <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-zinc-800/50 bg-zinc-900/40 shadow-2xl backdrop-blur-md">
                    <span className="h-8 w-8 animate-pulse rounded-full bg-gradient-to-tr from-zinc-500 to-white shadow-[0_0_20px_rgba(255,255,255,0.2)]"></span>
                  </div>
                  <div className="max-w-md text-center">
                    <h3 className="text-2xl font-semibold tracking-tight text-white/90">
                      Start thinking with Echo
                    </h3>
                    <p className="mt-3 text-[15px] leading-relaxed text-zinc-500">
                      Describe a problem, idea, decision, or question. Echo will automatically build a structured canvas as you type or talk.
                    </p>
                  </div>
                  <div className="pointer-events-auto mt-6 flex flex-wrap items-center justify-center gap-2 max-w-lg">
                    {[
                      "Map out authentication flow",
                      "Brainstorm architecture & database decisions",
                      "Identify bottlenecks & root causes",
                    ].map((promptText) => (
                      <button
                        key={promptText}
                        type="button"
                        onClick={() => {
                          setTranscript(promptText);
                          composerInputRef.current?.focus();
                        }}
                        className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800/80 hover:text-zinc-200 transition-all shadow-sm backdrop-blur-sm"
                      >
                        {promptText} →
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Meeting UI Dock (Phase 12.3 & 12.4) [FROZEN] */}
              <MeetingDock
                meetingState={meeting.meeting}
                localStream={meeting.localStream}
                screenStream={meeting.screenStream}
                remoteStreams={meeting.remoteStreams}
                isMicEnabled={meeting.isMicEnabled}
                isCameraEnabled={meeting.isCameraEnabled}
                isScreenSharing={meeting.isScreenSharing}
                activePresenterId={meeting.activePresenterId}
                localUserId={roomConnection.currentParticipant?.userId ?? null}
                localDisplayName={roomConnection.currentParticipant?.displayName ?? "You"}
                localColor={roomConnection.currentParticipant?.color ?? "#6366f1"}
                onStartMeeting={handleStartMeeting}
                onLeaveMeeting={handleLeaveMeeting}
                onSetMicEnabled={meeting.setMicEnabled}
                onSetCameraEnabled={meeting.setCameraEnabled}
                onToggleScreenShare={
                  meeting.isScreenSharing
                    ? meeting.stopScreenShare
                    : meeting.startScreenShare
                }
              />

            </div>

            {/* Composer Dock */}

            <div
              data-testid="composer-dock"
              className="shrink-0 w-full border-t border-zinc-800/40 bg-zinc-950/80 px-4 py-2.5 sm:py-3 flex justify-center items-center z-10 backdrop-blur-sm"
            >
              <div className="w-full max-w-3xl">
                <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-700/50 bg-zinc-900/80 p-2 shadow-2xl backdrop-blur-xl transition-all focus-within:border-zinc-500/50 focus-within:bg-zinc-900/95">
                  <div className="relative flex items-end gap-2">
                    <textarea
                      ref={composerInputRef}
                      value={transcript}
                      onChange={(event) => setTranscript(event.target.value)}
                      disabled={loading}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        if (event.shiftKey) return;
                        event.preventDefault();
                        if (loading || isListening || !transcript.trim()) return;
                        void analyzeTranscript();
                      }}
                      placeholder={isListening ? "Listening..." : loading ? "Echo is thinking..." : "Ask Echo..."}
                      rows={Math.min(4, Math.max(1, transcript.split('\n').length))}
                      className={`max-h-32 min-h-[44px] w-full resize-none bg-transparent px-3 py-3 text-sm outline-none placeholder:text-zinc-500 disabled:opacity-60 disabled:cursor-not-allowed ${
                        isListening ? "text-red-400" : "text-zinc-200"
                      }`}
                    />

                    <div className="flex shrink-0 items-center gap-2 pb-1 pr-1">
                      <button
                        type="button"
                        onClick={toggleListening}
                        disabled={loading}
                        className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                          isListening
                            ? "bg-red-500 text-white animate-pulse"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                        }`}
                        title={loading ? "Echo is thinking..." : isListening ? "Stop listening" : "Start voice input"}
                      >
                        {isListening ? "⏹" : "🎙️"}
                      </button>

                      <button
                        onClick={analyzeTranscript}
                        disabled={loading || isListening || !transcript.trim()}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-black transition-all hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-600"
                        title={loading ? "Echo is thinking..." : "Send message (Enter)"}
                      >
                        {loading ? (
                          <svg className="h-4 w-4 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-1">
                    <div className="flex items-center gap-2">
                      <select
                        value={voiceLanguage}
                        onChange={(event) => setVoiceLanguage(event.target.value)}
                        disabled={isListening || loading}
                        className="rounded-md border border-zinc-800/60 bg-transparent px-2 py-1 text-xs text-zinc-500 outline-none transition hover:border-zinc-700 hover:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="en-US">English</option>
                        <option value="hi-IN">Hindi</option>
                      </select>
                      <kbd className="hidden sm:inline-block rounded border border-zinc-800 bg-zinc-950/60 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
                        ⌘K
                      </kbd>
                    </div>

                    {loading ? (
                      <div data-testid="composer-thinking" className="flex items-center gap-2">
                        <span className="flex gap-1">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400" style={{ animationDelay: "0ms" }}></span>
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400" style={{ animationDelay: "150ms" }}></span>
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400" style={{ animationDelay: "300ms" }}></span>
                        </span>
                        <span className="text-xs font-medium text-amber-300/90">
                          {slowThinking ? "Echo is reasoning deeply…" : "Echo is thinking…"}
                        </span>
                      </div>
                    ) : (
                      <span
                        className={`min-w-0 flex-1 text-right text-xs leading-snug transition-colors ${
                          voiceFeedback.kind === "error"
                            ? "text-red-400 font-medium"
                            : voiceFeedback.kind === "info"
                            ? "text-emerald-400"
                            : voiceFeedback.kind === "listening"
                            ? "text-red-400 animate-pulse font-medium"
                            : "text-zinc-500"
                        }`}
                      >
                        {voiceFeedback.kind === "listening"
                          ? "Listening…"
                          : voiceFeedback.kind === "error" || voiceFeedback.kind === "info"
                          ? voiceFeedback.message
                          : "Ready"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

          </main>

          {/* Conversation */}

          <aside className={`flex shrink-0 flex-col overflow-hidden bg-zinc-950 transition-all duration-300 ${isConversationOpen ? "absolute inset-y-0 right-0 z-40 w-full sm:w-96 lg:static lg:z-auto border-l border-zinc-800 shadow-2xl lg:shadow-none" : "w-0 border-l-0"}`}>
            <div className="flex h-full w-full sm:w-96 flex-col">
              <div className="flex items-center justify-between border-b border-zinc-800 p-5">
                <div>
                  <h2 className="font-medium">
                    Conversation
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Talk to Echo and let AI build
                    the canvas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConversationOpen(false)}
                  className="lg:hidden flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition"
                  title="Close conversation panel"
                >
                  ✕
                </button>
              </div>

            <div className="flex min-h-0 flex-1 flex-col">

              {/* Messages */}

              <div className="flex-1 space-y-4 overflow-y-auto p-5">

                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="max-w-xs text-center">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/80 text-zinc-400 shadow-sm">
                        <svg className="h-5 w-5 text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-zinc-200">
                        Start thinking with Echo
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                        Describe a problem, idea, decision, or question using the composer below or by speaking to Echo.
                      </p>
                    </div>
                  </div>
                ) : (

                  messages.map((message) => (

                    <div
                      key={message.id}
                      className={
                        message.role === "user"
                          ? "flex justify-end"
                          : "flex justify-start"
                      }
                    >

                      <div
                        className={
                          message.role === "user"
                            ? "max-w-[85%] rounded-2xl rounded-br-md bg-white px-4 py-3 text-sm text-black"
                            : "max-w-[85%] rounded-2xl rounded-bl-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-200"
                        }
                      >

                        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider opacity-50">
                          {message.role === "user"
                            ? "You"
                            : "Echo"}
                        </div>

                        <div className="whitespace-pre-wrap leading-relaxed">
                          {message.content}
                        </div>

                      </div>

                    </div>

                  ))

                )}

                {loading ? (
                  <div
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                    className="flex justify-start"
                  >
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
                      {slowThinking
                        ? "Echo is still thinking…"
                        : "Echo is thinking..."}
                    </div>
                  </div>
                ) : null}

              </div>
            </div>
          </div>

        </aside>

        </div>

      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}