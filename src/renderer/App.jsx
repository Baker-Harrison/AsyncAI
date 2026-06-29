import React, { useState } from 'react';
import { Agentation } from 'agentation';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import MessageInput from './components/MessageInput';
import TaskModal from './components/TaskModal';

const now = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const DISPATCH_PROMPT =
  "I'm ready for you to start. Please implement the task we discussed, work autonomously, and open a PR when done.";

function App() {
  const [tasks, setTasks] = useState([]);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const activeTask = tasks.find((t) => t.id === activeTaskId) ?? null;

  const handleOpenModal = () => setShowModal(true);
  const handleCloseModal = () => setShowModal(false);

  const handleCreateTask = async ({ name, repo }) => {
    const id = `task-${Date.now()}`;

    setTasks((prev) => [
      ...prev,
      {
        id,
        name,
        repo,
        status: 'starting',
        containerId: null,
        sessionId: null,
        prUrl: null,
        messages: [
          {
            id: 1,
            role: 'system',
            text: `Cloning ${repo} and starting agent container…`,
            time: now(),
          },
        ],
      },
    ]);
    setActiveTaskId(id);

    try {
      const { containerId, sessionId } =
        await window.electronAPI.opencode.startContainer(repo, id);

      setTasks((prev) =>
        prev.map((t) =>
          t.id !== id
            ? t
            : {
                ...t,
                status: 'planning',
                containerId,
                sessionId,
                messages: [
                  ...t.messages,
                  {
                    id: Date.now(),
                    role: 'system',
                    text: `Agent ready. Describe what you want to build.`,
                    time: now(),
                  },
                ],
              }
        )
      );
    } catch (e) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id !== id
            ? t
            : {
                ...t,
                status: 'planning',
                messages: [
                  ...t.messages,
                  {
                    id: Date.now(),
                    role: 'system',
                    text: `Container error: ${e.message}`,
                    time: now(),
                  },
                ],
              }
        )
      );
    }
  };

  const handleSendMessage = async (text) => {
    const time = now();
    const capturedTaskId = activeTaskId;
    const capturedSessionId = activeTask?.sessionId;

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== capturedTaskId) return t;
        return {
          ...t,
          name:
            t.messages.filter((m) => m.role === 'user').length === 0
              ? text.slice(0, 45) + (text.length > 45 ? '…' : '')
              : t.name,
          messages: [
            ...t.messages,
            { id: Date.now(), role: 'user', text, time },
          ],
        };
      })
    );

    if (!capturedSessionId) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id !== capturedTaskId
            ? t
            : {
                ...t,
                messages: [
                  ...t.messages,
                  {
                    id: Date.now() + 1,
                    role: 'system',
                    text: 'Container not ready yet — try again in a moment.',
                    time: now(),
                  },
                ],
              }
        )
      );
      return;
    }

    setIsThinking(true);
    try {
      const responseText = await window.electronAPI.opencode.sendMessage(
        capturedSessionId,
        text
      );
      setTasks((prev) =>
        prev.map((t) =>
          t.id !== capturedTaskId
            ? t
            : {
                ...t,
                messages: [
                  ...t.messages,
                  {
                    id: Date.now(),
                    role: 'assistant',
                    text: responseText || '(empty response)',
                    time: now(),
                  },
                ],
              }
        )
      );
    } catch (e) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id !== capturedTaskId
            ? t
            : {
                ...t,
                messages: [
                  ...t.messages,
                  {
                    id: Date.now(),
                    role: 'system',
                    text: `Error: ${e.message}`,
                    time: now(),
                  },
                ],
              }
        )
      );
    } finally {
      setIsThinking(false);
    }
  };

  const handleDispatch = () => {
    const capturedTaskId = activeTaskId;
    setTasks((prev) =>
      prev.map((t) =>
        t.id !== capturedTaskId ? t : { ...t, status: 'running' }
      )
    );
    handleSendMessage(DISPATCH_PROMPT);
  };

  const inputDisabled =
    !activeTask ||
    activeTask.status === 'starting' ||
    activeTask.status === 'running' ||
    isThinking;

  const inputPlaceholder = isThinking
    ? 'Agent is thinking…'
    : activeTask?.status === 'starting'
    ? 'Starting container…'
    : activeTask?.status === 'running'
    ? 'Agent is working…'
    : 'Chat with your agent…';

  return (
    <div className="app">
      <TitleBar />
      <Agentation />
      <div className="app-body">
        <Sidebar
          tasks={tasks}
          activeTaskId={activeTaskId}
          onTaskSelect={setActiveTaskId}
          onNewTask={handleOpenModal}
        />
        <div className="main-panel">
          <ChatArea
            task={activeTask}
            onDispatch={handleDispatch}
            isThinking={isThinking}
            onNewTask={handleOpenModal}
          />
          {activeTask && (
            <MessageInput
              onSend={handleSendMessage}
              disabled={inputDisabled}
              placeholder={inputPlaceholder}
            />
          )}
        </div>
      </div>

      {showModal && (
        <TaskModal onClose={handleCloseModal} onCreate={handleCreateTask} />
      )}
    </div>
  );
}

export default App;
