"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import EchoCanvas from "./components/EchoCanvas";

type CanvasAction = {
  type: string;
  nodeType?: string;
  title?: string;
  description?: string;
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
  actions: CanvasAction[];
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "echo-conversations";

function createConversation(): Conversation {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: "New Conversation",
    messages: [],
    actions: [],
    createdAt: now,
    updatedAt: now,
  };
}

export default function Home() {
  const [transcript, setTranscript] = useState("");

  const [actions, setActions] = useState<CanvasAction[]>([]);

  const [messages, setMessages] = useState<Message[]>([]);

  const [conversations, setConversations] =
    useState<Conversation[]>([]);

  const [conversationId, setConversationId] =
    useState<string | null>(null);

  const [conversationTitle, setConversationTitle] =
    useState("New Conversation");

  const [loading, setLoading] = useState(false);

  const [isLoaded, setIsLoaded] = useState(false);

  const [isListening, setIsListening] =
    useState(false);

  const recognitionRef =
    useRef<any>(null);

  const finalTranscriptRef =
    useRef("");

  const [voiceLanguage, setVoiceLanguage] =
    useState("en-US");

  // --------------------------------------------------
  // Load saved conversation
  // --------------------------------------------------

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const savedConversations: Conversation[] =
          JSON.parse(saved);

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

          setActions(
            latestConversation.actions || []
          );

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

      setActions([]);

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

      const updatedConversation: Conversation = {
        id: conversationId,
        title: conversationTitle,
        messages,
        actions,
        createdAt:
          storedConversations.find(
            (conversation) =>
              conversation.id ===
              conversationId
          )?.createdAt || now,
        updatedAt: now,
      };

      const existingIndex =
        storedConversations.findIndex(
          (conversation) =>
            conversation.id ===
            conversationId
        );

      let updatedConversations: Conversation[];

      if (existingIndex >= 0) {
        updatedConversations = [
          ...storedConversations,
        ];

        updatedConversations[
          existingIndex
        ] = updatedConversation;
      } else {
        updatedConversations = [
          updatedConversation,
          ...storedConversations,
        ];
      }

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
    actions,
    messages,
    conversationId,
    conversationTitle,
    isLoaded,
  ]);

  // --------------------------------------------------
  // toggle listening
  // --------------------------------------------------

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any)
        .webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        "Speech recognition is not supported in this browser. Please use Chrome or Edge."
      );

      return;
    }

    const recognition =
      new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = voiceLanguage;

    recognition.onstart = () => {
      setIsListening(true);

      // Preserve anything the user already typed
      finalTranscriptRef.current =
        transcript.trim();
    };

    recognition.onresult = (
      event: any
    ) => {
      let interimTranscript = "";

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        const result =
          event.results[i];

        const text =
          result[0].transcript.trim();

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

      setTranscript(
        `${finalText} ${interimText}`.trim()
      );
    };

    recognition.onerror = (
      event: any
    ) => {
      console.error(
        "Speech recognition error:",
        event.error
      );

      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current =
      recognition;

    recognition.start();
  };

  // --------------------------------------------------
  // create new conversation
  // --------------------------------------------------

  const createNewConversation = () => {
    const newConversation =
      createConversation();

    setConversations(
      (currentConversations) => [
        newConversation,
        ...currentConversations,
      ]
    );

    setConversationId(
      newConversation.id
    );

    setConversationTitle(
      newConversation.title
    );

    setMessages([]);

    setActions([]);

    setTranscript("");
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

    setActions(
      selectedConversation.actions || []
    );

    setTranscript("");
  };

  // --------------------------------------------------
  // Analyze transcript
  // --------------------------------------------------

  const analyzeTranscript = async () => {
    if (!transcript.trim()) return;

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

    // Automatically create a title from
    // the first user message
    if (
      conversationTitle ===
      "New Conversation" &&
      messages.length === 0
    ) {
      const generatedTitle =
        userMessage.length > 40
          ? `${userMessage.slice(0, 40)}...`
          : userMessage;

      setConversationTitle(
        generatedTitle
      );
    }

    setLoading(true);

    try {
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

            currentCanvas: actions
              .filter(
                (action) =>
                  action.type ===
                  "CREATE_NODE"
              )
              .map((action) => ({
                title:
                  action.title,
                nodeType:
                  action.nodeType,
                description:
                  action.description,
              })),
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        console.error(data);
        return;
      }

      console.log(
        "Echo AI:",
        data
      );

      if (
        Array.isArray(data.actions)
      ) {
        setActions(
          (currentActions) => [
            ...currentActions,
            ...data.actions,
          ]
        );
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
      setLoading(false);
    }
  };

  return (
    <main className="h-screen bg-zinc-950 text-white">
      <div className="flex h-full flex-col">

        {/* Header */}

        <header className="flex h-16 items-center justify-between border-b border-zinc-800 px-6">

          <div>
            <h1 className="text-xl font-semibold">
              Echo
            </h1>

            <p className="text-xs text-zinc-500">
              {conversationTitle}
            </p>
          </div>

          <div className="flex items-center gap-2">

            <span className="h-2 w-2 rounded-full bg-green-500" />

            <span className="text-sm text-zinc-400">
              AI Ready
            </span>

          </div>

        </header>

        {/* Workspace */}

        <div className="flex min-h-0 flex-1">

          {/* History Sidebar */}

          <aside className="flex w-64 flex-col border-r border-zinc-800 bg-zinc-950">

            {/* New Chat */}

            <div className="border-b border-zinc-800 p-4">

              <button
                onClick={createNewConversation}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800"
              >
                + New Chat
              </button>

            </div>

            {/* Conversation List */}

            <div className="flex-1 overflow-y-auto p-3">

              <div className="mb-3 px-2 text-xs font-medium uppercase tracking-wider text-zinc-600">
                Conversations
              </div>

              {conversations.length === 0 ? (
                <div className="px-2 py-4 text-sm text-zinc-600">
                  No conversations yet.
                </div>
              ) : (
                <div className="space-y-1">

                  {conversations.map(
                    (conversation) => (
                      <button
                        key={conversation.id}
                        onClick={() =>
                          switchConversation(conversation)
                        }
                        className={`w-full rounded-lg px-3 py-3 text-left transition ${conversation.id ===
                          conversationId
                          ? "bg-zinc-800"
                          : "hover:bg-zinc-900"
                          }`}
                      >

                        <div className="truncate text-sm font-medium text-zinc-200">
                          {conversation.title}
                        </div>

                        <div className="mt-1 text-xs text-zinc-600">
                          {new Date(
                            conversation.updatedAt
                          ).toLocaleDateString()}
                        </div>

                      </button>
                    )
                  )}

                </div>
              )}

            </div>

          </aside>
          {/* Canvas */}

          <section className="flex-1">

            <EchoCanvas
              actions={actions}
            />

          </section>

          {/* Conversation */}

          <aside className="flex w-96 flex-col border-l border-zinc-800">

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

                      <div className="mb-3 text-3xl">
                        ✨
                      </div>

                      <p className="text-sm text-zinc-400">
                        Start a conversation with Echo.
                      </p>

                      <p className="mt-2 text-xs text-zinc-600">
                        Tell Echo about your problem,
                        idea, or goal and let AI build
                        the canvas.
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
                  className={`absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full transition ${isListening
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  title={
                    isListening
                      ? "Stop listening"
                      : "Start voice input"
                  }
                >
                  {isListening ? "⏹" : "🎙️"}
                </button>

              </div>

              <div className="mt-3 flex items-center justify-between">

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

                <span className="text-xs text-zinc-600">
                  {isListening
                    ? "Listening..."
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
                  ? "Echo is thinking..."
                  : "🧠 Analyze with Echo"}
              </button>

            </div>

          </aside>

        </div>

      </div>
    </main>
  );
}