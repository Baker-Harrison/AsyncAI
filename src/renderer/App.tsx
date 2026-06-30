import React, { useState, useEffect, useRef } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import MessageInput from './components/MessageInput';
import TaskModal from './components/TaskModal';
import UpdateBanner from './components/UpdateBanner';
import SettingsModal from './components/SettingsModal';
import TerminalView from './components/TerminalView';
import type { Agent, Message, FileData } from './types';

let msgSeq = 0;
const mkId = () => `ui-${++msgSeq}`;

const now = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function App() {
  const [agents, setAgents]             = useState<Agent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [isThinking, setIsThinking]     = useState(false);
  const [showModal, setShowModal]       = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  const [activeView, setActiveView]     = useState<'chat' | 'terminal'>('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Maps tool-call API id → UI message id
  const toolMsgIds = useRef<Record<string, string>>({});

  const activeAgent = agents.find((a) => a.id === activeAgentId) ?? null;

  // ── Load agents on mount ───────────────────────────────────────────────
  useEffect(() => {
    window.electronAPI.agent.list().then((loaded) => {
      const withIds = loaded.map((agent) => ({
        ...agent,
        messages: agent.messages.map((m) => ({ ...m, id: m.id ?? mkId() })),
      }));
      setAgents(withIds);
      if (withIds.length > 0) setActiveAgentId(withIds[0].id);
    });

    // Show settings on first launch if no API key
    window.electronAPI.settings.get('opencode_api_key').then((key) => {
      if (!key) {
        setIsFirstLaunch(true);
        setShowSettings(true);
      }
    });
  }, []);

  // ── Main-process events ────────────────────────────────────────────────
  useEffect(() => {
    const { agent } = window.electronAPI;

    // Context cleared — wipe UI messages for this agent
    agent.onCleared(({ agentId }) => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id !== agentId ? a : { ...a, messages: [] }
        )
      );
    });

    // Agent deleted — remove from list
    agent.onDeleted(({ agentId }) => {
      setAgents((prev) => {
        const next = prev.filter((a) => a.id !== agentId);
        if (activeAgentId === agentId) {
          setActiveAgentId(next[0]?.id ?? null);
        }
        return next;
      });
    });

    // Agent renamed — update name in list
    agent.onRenamed(({ agentId, name }) => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id !== agentId ? a : { ...a, name }
        )
      );
    });

    // Container ready / error status updates
    agent.onStatus(({ agentId, status, error }) => {
      setAgents((prev) =>
        prev.map((a) => {
          if (a.id !== agentId) return a;
          if (status === 'error') {
            return {
              ...a,
              status: 'error',
              messages: [...a.messages, { id: mkId(), role: 'system', text: `Error: ${error}`, time: now() }],
            };
          }
          return { ...a, status };
        })
      );
    });

    // Track the current streaming message ID per agent
    const streamingMsgIds: Record<string, string> = {};

    // Streaming events from the agent harness
    agent.onEvent((event: { agentId: string; type: string; [key: string]: unknown }) => {
      const { agentId, type, ...payload } = event;
      switch (type) {
        case 'thinking':
          setIsThinking(true);
          break;

        case 'text-chunk': {
          // Append to the last assistant message (streaming)
          setIsThinking(false);
          const chunkText = payload.text as string;
          setAgents((prev) =>
            prev.map((a) => {
              if (a.id !== agentId) return a;
              const msgs = [...a.messages];
              // Find the last assistant message that's the current streaming target
              const lastMsg = msgs[msgs.length - 1];
              if (lastMsg && lastMsg.role === 'assistant' && lastMsg._streaming) {
                // Append to existing streaming message
                msgs[msgs.length - 1] = {
                  ...lastMsg,
                  text: lastMsg.text + chunkText,
                };
              } else {
                // Start a new streaming message
                const id = mkId();
                streamingMsgIds[agentId] = id;
                msgs.push({
                  id, role: 'assistant' as const, text: chunkText, time: now(), _streaming: true,
                });
              }
              return { ...a, messages: msgs };
            })
          );
          break;
        }

        case 'text':
          setIsThinking(false);
          const finalText = payload.text as string;
          setAgents((prev) =>
            prev.map((a) => {
              if (a.id !== agentId) return a;
              const msgs = [...a.messages];
              // Find the streaming message and finalize it
              const streamId = streamingMsgIds[agentId];
              if (streamId) {
                const idx = msgs.findIndex((m) => m.id === streamId);
                if (idx >= 0) {
                  msgs[idx] = { ...msgs[idx], _streaming: false };
                }
                delete streamingMsgIds[agentId];
              } else {
                // Non-streaming fallback: create a new message
                msgs.push({ id: mkId(), role: 'assistant' as const, text: finalText, time: now() });
              }
              return { ...a, messages: msgs };
            })
          );
          break;

        case 'tool-start': {
          setIsThinking(false);
          const msgId = mkId();
          toolMsgIds.current[payload.id as string] = msgId;
          const toolName = payload.tool as string;
          const toolParams = payload.params as Record<string, unknown>;
          // Finalize any streaming message before showing tool
          setAgents((prev) =>
            prev.map((a) => {
              if (a.id !== agentId) return a;
              const msgs = [...a.messages];
              const streamId = streamingMsgIds[agentId];
              if (streamId) {
                const idx = msgs.findIndex((m) => m.id === streamId);
                if (idx >= 0) msgs[idx] = { ...msgs[idx], _streaming: false };
                delete streamingMsgIds[agentId];
              }
              msgs.push({ id: msgId, role: 'tool' as const, tool: toolName, params: toolParams, output: null, status: 'running' });
              return { ...a, messages: msgs };
            })
          );
          break;
        }

        case 'tool-done': {
          const doneMsgId = toolMsgIds.current[payload.id as string];
          if (doneMsgId) {
            const doneOutput = payload.output as string | null;
            const doneStatus = payload.status as string;
            setAgents((prev) =>
              prev.map((a) =>
                a.id !== agentId ? a : {
                  ...a,
                  messages: a.messages.map((m) =>
                    m.id !== doneMsgId ? m : { ...m, output: doneOutput, status: doneStatus }
                  ),
                }
              )
            );
          }
          break;
        }

        case 'error':
          setIsThinking(false);
          const errMsg = payload.message as string;
          setAgents((prev) =>
            prev.map((a) =>
              a.id !== agentId ? a : {
                ...a,
                messages: [...a.messages, { id: mkId(), role: 'system' as const, text: `Error: ${errMsg}`, time: now() }],
              }
            )
          );
          break;

        case 'done':
          setIsThinking(false);
          // Clean up streaming state
          if (streamingMsgIds[agentId]) {
            delete streamingMsgIds[agentId];
          }
          break;
      }
    });
  }, [activeAgentId]);

  // ── Create agent ───────────────────────────────────────────────────────
  const handleCreateAgent = async ({ name }: { name: string }) => {
    const agent = await window.electronAPI.agent.create(name);
    setAgents((prev) => [...prev, { ...agent, messages: [] }]);
    setActiveAgentId(agent.id);
  };

  // ── Delete agent ───────────────────────────────────────────────────────
  const handleDeleteAgent = async (agentId: string) => {
    await window.electronAPI.agent.delete(agentId);
    // UI is removed via agent-deleted event from main process
  };

  // ── Rename agent ───────────────────────────────────────────────────────
  const handleRenameAgent = async (agentId: string, name: string) => {
    await window.electronAPI.agent.rename(agentId, name);
    // UI is updated via agent-renamed event from main process
  };

  // ── Send message ───────────────────────────────────────────────────────
  const handleSend = async (text: string, files?: FileData[]) => {
    if (!activeAgentId || isThinking) return;

    const fileAttachments = files?.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
    })) || [];

    let displayText = text;
    if (fileAttachments.length > 0) {
      const fileList = fileAttachments.map((f) => `📎 ${f.name}`).join('\n');
      displayText = text ? `${text}\n\n${fileList}` : fileList;
    }

    setAgents((prev) =>
      prev.map((a) =>
        a.id !== activeAgentId ? a : {
          ...a,
          messages: [...a.messages, { id: mkId(), role: 'user', text: displayText, time: now() }],
        }
      )
    );

    await window.electronAPI.agent.chat(activeAgentId, text, files);
  };

  // ── Slash commands ─────────────────────────────────────────────────────
  const handleCommand = async (name: string) => {
    if (!activeAgentId) return;
    if (name === '/clear') {
      await window.electronAPI.agent.clear(activeAgentId);
      // UI is cleared via agent-cleared event from main process
    }
  };

  const handleAgentSelect = (agentId: string) => {
    setActiveAgentId(agentId);
    setActiveView('chat');
  };

  const inputDisabled = !activeAgent || activeAgent.status === 'starting' || isThinking;
  const inputPlaceholder = isThinking ? 'Agent is thinking…' : 'Message your agent…';

  const handleSettingsClose = () => {
    setShowSettings(false);
    setIsFirstLaunch(false);
  };

  return (
    <div className="app">
      <TitleBar
        onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        sidebarCollapsed={sidebarCollapsed}
      />
      <UpdateBanner />
      <div className="app-body">
        <Sidebar
          agents={agents}
          activeAgentId={activeAgentId}
          onAgentSelect={handleAgentSelect}
          onNewAgent={() => setShowModal(true)}
          onOpenSettings={() => setShowSettings(true)}
          onDeleteAgent={handleDeleteAgent}
          onRenameAgent={handleRenameAgent}
          collapsed={sidebarCollapsed}
        />
        <div className={`main-panel ${sidebarCollapsed ? 'main-panel--wide' : ''}`}>
          {activeView === 'terminal' && activeAgent ? (
            <TerminalView
              agent={activeAgent}
              onBack={() => setActiveView('chat')}
            />
          ) : (
            <>
              <ChatArea
                agent={activeAgent}
                isThinking={isThinking}
                onNewAgent={() => setShowModal(true)}
                onOpenTerminal={() => setActiveView('terminal')}
              />
              {activeAgent && activeAgent.status !== 'starting' && (
                <MessageInput
                  onSend={handleSend}
                  onCommand={handleCommand}
                  disabled={inputDisabled}
                  placeholder={inputPlaceholder}
                />
              )}
            </>
          )}
        </div>
      </div>

      {showModal && (
        <TaskModal
          onClose={() => setShowModal(false)}
          onCreate={handleCreateAgent}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={handleSettingsClose}
          isFirstLaunch={isFirstLaunch}
        />
      )}
    </div>
  );
}

export default App;
