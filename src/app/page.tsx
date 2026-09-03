"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import EchoCanvas from "./components/EchoCanvas";
import RoomControls from "./components/RoomControls";
import { applyCanvasActions } from "./lib/applyCanvasActions";
import { createCanvasSnapshot } from "./lib/collaboration/canvasSnapshot";
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
import {
  buildGraphContext,
  logGraphContext,
} from "./lib/graphContext";

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
  return {
    nodes: Array.isArray(canvas?.nodes) ? canvas.nodes : [],
    edges: Array.isArray(canvas?.edges) ? canvas.edges : [],
    groups: Array.isArray(canvas?.groups) ? canvas.groups : [],
  };
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

function conversationMatchesSearch(
  conversation: Conversation,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return true;
  }

  if (conversation.title.toLowerCase().includes(needle)) {
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

function Home() {
  const searchParams = useSearchParams();
  const roomId = getRoomIdFromUrl(searchParams);

  const [transcript, setTranscript] = useState("");

  const [canvas, setCanvas] = useState<CanvasState>(emptyCanvas);
  const canvasRef = useRef(canvas);

  const [isLoaded, setIsLoaded] = useState(false);
  const remoteSnapshotAppliedRef = useRef(false);

  const roomConnection = useRoomChannel(isLoaded ? roomId : null, {
    getSnapshot: () => createCanvasSnapshot(canvasRef.current),
    onRemoteSnapshot: (snapshot) => {
      remoteSnapshotAppliedRef.current = true;
      setCanvas(snapshot);
    },
    onRemoteNodeEvent: (event) => {
      setCanvas((currentCanvas) => applyRemoteNodeEvent(currentCanvas, event));
    },
    onRemoteEdgeEvent: (event) => {
      setCanvas((currentCanvas) => applyRemoteEdgeEvent(currentCanvas, event));
    },
    onRemoteGroupEvent: (event) => {
      setCanvas((currentCanvas) => applyRemoteGroupEvent(currentCanvas, event));
    },
  });

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
  // Load saved conversation
  // --------------------------------------------------

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const savedConversations: Conversation[] =
          JSON.parse(saved);

        // Existing localStorage hydrate (Phase 9); keep this path unchanged.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- client storage restore
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

          if (!remoteSnapshotAppliedRef.current) {
            setCanvas(
              normalizeLoadedCanvas(latestConversation.canvas)
            );
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

      setCanvas(emptyCanvas());

      setIsLoaded(true);
    } catch (error) {
      console.error(
        "Failed to load Echo conversation:",
        error
      );

      setIsLoaded(true);
    }
  }, []);

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

    try {
      const saved =
        localStorage.getItem(STORAGE_KEY);

      let storedConversations: Conversation[] =
        [];

      if (saved) {
        storedConversations =
          JSON.parse(saved);
      }

      const now =
        new Date().toISOString();

      const existingConversation =
        storedConversations.find(
          (conversation) =>
            conversation.id ===
            conversationId
        );

      const updatedConversation: Conversation = {
        id: conversationId,
        title: conversationTitle,
        messages,
        actions:
          existingConversation?.actions || [],
        canvas,
        createdAt:
          existingConversation?.createdAt ||
          now,
        updatedAt: now,
      };

      const remainingConversations =
        storedConversations.filter(
          (conversation) =>
            conversation.id !==
            conversationId
        );

      const updatedConversations = [
        updatedConversation,
        ...remainingConversations,
      ];

      // Existing localStorage autosave (Phase 9); keep this path unchanged.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- persist conversation list
      setConversations(
        updatedConversations
      );

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          updatedConversations
        )
      );
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
      const saved =
        localStorage.getItem(STORAGE_KEY);

      let storedConversations: Conversation[] =
        [];

      if (saved) {
        storedConversations =
          JSON.parse(saved);
      }

      // Flush the active conversation first so the empty
      // reset cannot overwrite it in the autosave effect.
      if (conversationId) {
        const now =
          new Date().toISOString();

        const existingConversation =
          storedConversations.find(
            (conversation) =>
              conversation.id ===
              conversationId
          );

        const currentConversation: Conversation =
          {
            id: conversationId,
            title: conversationTitle,
            messages,
            actions:
              existingConversation?.actions ||
              [],
            canvas,
            createdAt:
              existingConversation?.createdAt ||
              now,
            updatedAt: now,
          };

        storedConversations =
          storedConversations.filter(
            (conversation) =>
              conversation.id !==
              conversationId
          );

        storedConversations = [
          currentConversation,
          ...storedConversations,
        ];
      }

      const newConversation =
        createConversation();

      storedConversations = [
        newConversation,
        ...storedConversations,
      ];

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          storedConversations
        )
      );

      // Skip the next autosave so batched resets cannot
      // write empty messages/canvas into the previous id.
      skipAutosaveRef.current = true;

      setConversations(
        storedConversations
      );

      setConversationId(
        newConversation.id
      );

      setConversationTitle(
        newConversation.title
      );

      setMessages([]);

      setCanvas(emptyCanvas());

      setTranscript("");
      setRenamingConversationId(null);
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
    setConversationId(
      selectedConversation.id
    );

    setConversationTitle(
      selectedConversation.title
    );

    setMessages(
      selectedConversation.messages || []
    );

    setCanvas(
      normalizeLoadedCanvas(selectedConversation.canvas)
    );

    setTranscript("");
    setRenamingConversationId(null);
  };

  // --------------------------------------------------
  // rename conversation
  // --------------------------------------------------

  const startRenamingConversation = (
    conversation: Conversation
  ) => {
    setRenamingConversationId(conversation.id);
    setRenameDraft(conversation.title);
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
      const storedConversations =
        readStoredConversations();

      const updatedConversations =
        storedConversations.map(
          (conversation) =>
            conversation.id === targetId
              ? {
                  ...conversation,
                  title: nextTitle,
                }
              : conversation
        );

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(updatedConversations)
      );

      setConversations(updatedConversations);

      if (targetId === conversationId) {
        setConversationTitle(nextTitle);
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
      const storedConversations =
        readStoredConversations();

      const remainingConversations =
        storedConversations.filter(
          (conversation) =>
            conversation.id !== targetId
        );

      if (targetId === conversationId) {
        skipAutosaveRef.current = true;

        if (remainingConversations.length > 0) {
          const nextConversation =
            remainingConversations[0];

          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(
              remainingConversations
            )
          );

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

          setCanvas(
            normalizeLoadedCanvas(nextConversation.canvas)
          );

          setTranscript("");
          setRenamingConversationId(null);
          return;
        }

        const newConversation =
          createConversation();

        const nextConversations = [
          newConversation,
        ];

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(nextConversations)
        );

        setConversations(nextConversations);

        setConversationId(newConversation.id);

        setConversationTitle(
          newConversation.title
        );

        setMessages([]);

        setCanvas(emptyCanvas());

        setTranscript("");
        setRenamingConversationId(null);
        return;
      }

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(remainingConversations)
      );

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
    let didMove = false;

    setCanvas((currentCanvas) => {
      const nextCanvas = moveSemanticNode(currentCanvas, nodeId, position);
      didMove = nextCanvas !== currentCanvas;
      return nextCanvas;
    });

    if (didMove) {
      roomConnection.broadcastNodeMoved(nodeId, position);
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

    // Title only from the first meaningful user
    // message; keep it once it is set.
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
        setConversationTitle(generatedTitle);
      }
    }

    setSlowThinking(false);
    setLoading(true);
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
        let nodeMutations: ReturnType<typeof diffLocalNodeMutations> = [];
        let edgeMutations: ReturnType<typeof diffLocalEdgeMutations> = [];
        let groupMutations: ReturnType<typeof diffLocalGroupMutations> = [];

        setCanvas((currentCanvas) => {
          const applyStart = performance.now();
          const nextCanvas = applyCanvasActions(
            currentCanvas,
            data.actions
          );
          nodeMutations = diffLocalNodeMutations(
            currentCanvas,
            nextCanvas
          );
          edgeMutations = diffLocalEdgeMutations(
            currentCanvas,
            nextCanvas
          );
          groupMutations = diffLocalGroupMutations(
            currentCanvas,
            nextCanvas
          );
          if (process.env.NODE_ENV !== "production") {
            console.log(
              "[ECHO LATENCY] applyCanvasActions:",
              `${Math.round((performance.now() - applyStart) * 100) / 100} ms`
            );
          }
          return nextCanvas;
        });

        publishLocalNodeMutations(nodeMutations, roomConnection);
        publishLocalEdgeMutations(edgeMutations, roomConnection);
        publishLocalGroupMutations(groupMutations, roomConnection);

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

      setTranscript("");
    } catch (error) {
      console.error(error);
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

  return (
    <main className="h-screen overflow-hidden bg-zinc-950 text-white">
      <div className="flex h-full min-w-0 flex-col">

        {/* Header */}

        <header className="flex h-16 min-w-0 items-center justify-between border-b border-zinc-800 px-6">

          <div className="min-w-0 pr-4">
            <h1 className="text-xl font-semibold">
              Echo
            </h1>

            <p
              className="truncate text-xs text-zinc-500"
              title={conversationTitle}
            >
              {conversationTitle}
            </p>
          </div>

          <div className="flex min-w-0 items-center gap-3">

            <RoomControls connection={roomConnection} />

            <span className="h-2 w-2 rounded-full bg-green-500" />

            <span className="text-sm text-zinc-400">
              AI Ready
            </span>

          </div>

        </header>

        {/* Workspace */}

        <div className="flex min-h-0 min-w-0 flex-1">

          {/* History Sidebar */}

          <aside className="flex w-64 min-w-0 shrink-0 flex-col overflow-hidden border-r border-zinc-800 bg-zinc-950">

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
                            title={conversation.title}
                            aria-label={conversation.title}
                            onClick={() =>
                              switchConversation(
                                conversation
                              )
                            }
                            className="block w-full min-w-0 truncate text-left text-sm font-medium text-zinc-200"
                          >
                            {conversation.title}
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

          </aside>
          {/* Canvas */}

          <section className="relative min-h-0 min-w-0 flex-1">

            <EchoCanvas
              canvas={canvas}
              onNodePositionChange={
                updateNodePosition
              }
              remoteCursors={roomConnection.remoteCursors}
              participants={roomConnection.participants}
              onCursorMove={
                roomId ? roomConnection.broadcastCursorMove : undefined
              }
            />

            {isEmptyWorkspace ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
                <div className="max-w-sm text-center">
                  <p className="text-lg font-medium text-zinc-200">
                    Start thinking with Echo
                  </p>
                  <p className="mt-2 text-sm text-zinc-500">
                    Describe a problem, idea, decision, or
                    question.
                  </p>
                </div>
              </div>
            ) : null}

          </section>

          {/* Conversation */}

          <aside className="flex w-96 min-w-0 shrink-0 flex-col overflow-hidden border-l border-zinc-800">

            <div className="border-b border-zinc-800 p-5">

              <h2 className="font-medium">
                Conversation
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Talk to Echo and let AI build
                the canvas.
              </p>

            </div>

            <div className="flex min-h-0 flex-1 flex-col">

              {/* Messages */}

              <div className="flex-1 space-y-4 overflow-y-auto p-5">

                {messages.length === 0 ? (

                  <div className="flex h-full items-center justify-center">

                    <div className="max-w-xs text-center">

                      <p className="text-sm font-medium text-zinc-200">
                        Start thinking with Echo
                      </p>

                      <p className="mt-2 text-xs text-zinc-500">
                        Describe a problem, idea, decision,
                        or question.
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

              {/* Composer */}

              <div className="relative">

                <textarea
                  value={transcript}
                  onChange={(event) =>
                    setTranscript(
                      event.target.value
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") {
                      return;
                    }

                    if (event.shiftKey) {
                      return;
                    }

                    event.preventDefault();

                    if (
                      loading ||
                      isListening ||
                      !transcript.trim()
                    ) {
                      return;
                    }

                    void analyzeTranscript();
                  }}
                  placeholder={
                    isListening
                      ? "Listening..."
                      : "Talk to Echo..."
                  }
                  rows={4}
                  className={`w-full resize-none rounded-xl border bg-zinc-900 p-4 pr-14 text-sm outline-none placeholder:text-zinc-600 ${isListening
                    ? "border-red-500/50"
                    : "border-zinc-800 focus:border-zinc-600"
                    }`}
                />

                <button
                  type="button"
                  onClick={toggleListening}
                  disabled={loading}
                  className={`absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${isListening
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  title={
                    loading
                      ? slowThinking
                        ? "Echo is still thinking…"
                        : "Echo is thinking..."
                      : isListening
                        ? "Stop listening"
                        : "Start voice input"
                  }
                >
                  {isListening ? "⏹" : "🎙️"}
                </button>

              </div>

              <div className="mt-3 flex items-center justify-between gap-3">

                <select
                  value={voiceLanguage}
                  onChange={(event) =>
                    setVoiceLanguage(
                      event.target.value
                    )
                  }
                  disabled={isListening}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400 outline-none transition hover:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="en-US">
                    English
                  </option>

                  <option value="hi-IN">
                    Hindi
                  </option>
                </select>

                <span
                  className={`min-w-0 flex-1 text-right text-xs leading-snug ${
                    voiceFeedback.kind === "error"
                      ? "text-red-400"
                      : "text-zinc-600"
                  }`}
                >
                  {voiceFeedback.kind === "listening"
                    ? "Listening…"
                    : voiceFeedback.kind === "error" ||
                        voiceFeedback.kind === "info"
                      ? voiceFeedback.message
                      : "Voice input available"}
                </span>

              </div>

            </div>

            <div className="border-t border-zinc-800 p-5">

              <button
                onClick={analyzeTranscript}
                disabled={
                  loading ||
                  isListening ||
                  !transcript.trim()
                }
                className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? slowThinking
                    ? "Echo is still thinking…"
                    : "Echo is thinking..."
                  : "🧠 Analyze with Echo"}
              </button>

            </div>

          </aside>

        </div>

      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}