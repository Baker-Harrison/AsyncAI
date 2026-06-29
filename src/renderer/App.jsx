import React, { useState, useEffect, useRef } from 'react';
import { Agentation } from 'agentation';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import MessageInput from './components/MessageInput';
import TaskModal from './components/TaskModal';
import UpdateBanner from './components/UpdateBanner';
import SettingsModal from './components/SettingsModal';
import TerminalView from './components/TerminalView';

let msgSeq = 0;
const mkId = () => `ui-${++msgSeq}`;

const now = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function App() {
  const [agents, setAgents]             = useState([]);
  const [activeAgentId, setActiveAgentId] = useState(null);
  const [isThinking, setIsThinking]     = useState(false);
  const [showModal, setShowModal]       = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  const [activeView, setActiveView]     = useState('chat'); // 'chat' | 'terminal'

  // Maps tool-call API id → UI message id
  const toolMsgIds = useRef({});

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

    // Streaming events from the agent harness
    agent.onEvent(({ agentId, type, ...payload }) => {
      switch (type) {
        case 'thinking':
          setIsThinking(true);
          break;

        case 'text':
          setIsThinking(false);
          setAgents((prev) =>
            prev.map((a) =>
              a.id !== agentId ? a : {
                ...a,
                messages: [...a.messages, { id: mkId(), role: 'assistant', text: payload.text, time: now() }],
              }
            )
          );
          break;

        case 'tool-start': {
          setIsThinking(false);
          const msgId = mkId();
          toolMsgIds.current[payload.id] = msgId;
          setAgents((prev) =>
            prev.map((a) =>
              a.id !== agentId ? a : {
                ...a,
                messages: [
                  ...a.messages,
                  { id: msgId, role: 'tool', tool: payload.tool, params: payload.params, output: null, status: 'running' },
                ],
              }
            )
          );
          break;
        }

        case 'tool-done': {
          const msgId = toolMsgIds.current[payload.id];
          if (msgId) {
            setAgents((prev) =>
              prev.map((a) =>
                a.id !== agentId ? a : {
                  ...a,
                  messages: a.messages.map((m) =>
                    m.id !== msgId ? m : { ...m, output: payload.output, status: payload.status }
                  ),
                }
              )
            );
          }
          break;
        }

        case 'error':
          setIsThinking(false);
          setAgents((prev) =>
            prev.map((a) =>
              a.id !== agentId ? a : {
                ...a,
                messages: [...a.messages, { id: mkId(), role: 'system', text: `Error: ${payload.message}`, time: now() }],
              }
            )
          );
          break;

        case 'done':
          setIsThinking(false);
          break;
      }
    });
  }, []);

  // ── Create agent ───────────────────────────────────────────────────────
  const handleCreateAgent = async ({ name }) => {
    const agent = await window.electronAPI.agent.create(name);
    setAgents((prev) => [...prev, { ...agent, messages: [] }]);
    setActiveAgentId(agent.id);
  };

  // ── Send message ───────────────────────────────────────────────────────
  const handleSend = async (text) => {
    if (!activeAgentId || isThinking) return;

    setAgents((prev) =>
      prev.map((a) =>
        a.id !== activeAgentId ? a : {
          ...a,
          messages: [...a.messages, { id: mkId(), role: 'user', text, time: now() }],
        }
      )
    );

    await window.electronAPI.agent.chat(activeAgentId, text);
  };

  // ── Slash commands ─────────────────────────────────────────────────────
  const handleCommand = async (name) => {
    if (!activeAgentId) return;
    if (name === '/clear') {
      await window.electronAPI.agent.clear(activeAgentId);
      // UI is cleared via agent-cleared event from main process
    }
  };

  const handleAgentSelect = (agentId) => {
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
      <TitleBar />
      <Agentation />
      <UpdateBanner />
      <div className="app-body">
        <Sidebar
          agents={agents}
          activeAgentId={activeAgentId}
          onAgentSelect={handleAgentSelect}
          onNewAgent={() => setShowModal(true)}
          onOpenSettings={() => setShowSettings(true)}
        />
        <div className="main-panel">
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
