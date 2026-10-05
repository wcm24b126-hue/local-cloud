import React, { useState, useRef, useEffect } from 'react';
import { Terminal, X, Maximize2, Minimize2, Trash2, HelpCircle } from 'lucide-react';
import { useLocalCloud } from '../../context/LocalCloudContext';
import { useNetLab } from '../../netlab/NetLabContext';
import { isCloudShellEnabled } from '../../sim/mode';

interface TerminalLine {
  id: string;
  type: 'prompt' | 'output' | 'error' | 'system';
  text: string;
}

export const CloudShellDrawer: React.FC = () => {
  const {
    isCloudShellOpen,
    setIsCloudShellOpen,
    currentProject,
    executeCliCommand,
  } = useLocalCloud();
  const { runShellCommand } = useNetLab();

  // ENABLE_CLOUD_SHELL=false hides the terminal entirely.
  if (!isCloudShellEnabled()) return null;

  const [isMaximized, setIsMaximized] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: 'init-1',
      type: 'system',
      text: 'Welcome to LocalCloud Shell (Debian GNU/Linux 12 / x86_64 emulator)',
    },
    {
      id: 'init-2',
      type: 'system',
      text: `Default project set to [${currentProject.projectId}]. Type 'help' to view available commands.`,
    },
  ]);

  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isCloudShellOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isCloudShellOpen, lines]);

  if (!isCloudShellOpen) return null;

  const promptPrefix = `student@cloudshell:~ (${currentProject.projectId})$ `;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const command = inputVal.trim();
    if (!command) return;

    // Record prompt in terminal lines
    const newLines: TerminalLine[] = [
      ...lines,
      { id: Date.now().toString(), type: 'prompt', text: `${promptPrefix}${command}` },
    ];

    // Add to history
    setHistory(prev => [...prev, command]);
    setHistoryIndex(-1);
    setInputVal('');

    // Networking-lab commands take priority, so `gcloud compute networks list`
    // reflects the simulated lab rather than the older emulator tables.
    const labOutput = runShellCommand(command);
    const output = labOutput.length > 0 ? labOutput : executeCliCommand(command);

    if (output.length === 1 && output[0] === '__CLEAR__') {
      setLines([]);
      return;
    }

    output.forEach((out, i) => {
      newLines.push({
        id: `${Date.now()}-out-${i}`,
        type: out.startsWith('ERROR:') ? 'error' : 'output',
        text: out,
      });
    });

    setLines(newLines);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInputVal(history[nextIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(-1);
        setInputVal('');
      } else {
        setHistoryIndex(nextIndex);
        setInputVal(history[nextIndex]);
      }
    }
  };

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 bg-[#0e0e0f] border-t border-[var(--border-color)] shadow-2xl flex flex-col transition-all duration-200 ${
        isMaximized ? 'h-[75vh]' : 'h-72 sm:h-80'
      }`}
    >
      {/* Terminal Title Bar */}
      <div className="h-9 px-3 bg-[#1e1f20] border-b border-[var(--border-color)] flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2 text-xs">
          <Terminal className="w-4 h-4 text-[var(--success)]" />
          <span className="font-mono text-neutral-300 font-medium truncate max-w-sm">
            cloudshell:~ ({currentProject.projectId})
          </span>
          <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400 font-mono">
            bash
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setLines([])}
            className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            title="Clear output"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setInputVal('help');
              inputRef.current?.focus();
            }}
            className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            title="Show commands help"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            title={isMaximized ? 'Restore size' : 'Maximize terminal'}
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setIsCloudShellOpen(false)}
            className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            title="Close Cloud Shell"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex-1 p-3 overflow-y-auto font-mono text-xs text-neutral-200 space-y-1 cursor-text"
      >
        {lines.map(line => {
          if (line.type === 'system') {
            return (
              <div key={line.id} className="text-neutral-400 italic">
                {line.text}
              </div>
            );
          }
          if (line.type === 'prompt') {
            return (
              <div key={line.id} className="text-neutral-100 flex items-start gap-1">
                <span className="text-[var(--accent-blue)] shrink-0 font-semibold">{promptPrefix}</span>
                <span className="font-semibold text-white">{line.text.replace(promptPrefix, '')}</span>
              </div>
            );
          }
          if (line.type === 'error') {
            return (
              <div key={line.id} className="text-[var(--danger)] whitespace-pre-wrap">
                {line.text}
              </div>
            );
          }
          return (
            <div key={line.id} className="text-neutral-300 whitespace-pre-wrap">
              {line.text}
            </div>
          );
        })}

        {/* Active Command Input Line */}
        <form onSubmit={handleSubmit} className="flex items-center gap-1 pt-1">
          <span className="text-[var(--accent-blue)] shrink-0 font-semibold select-none">
            {promptPrefix}
          </span>
          <input
            ref={inputRef}
            type="text"
            aria-label="Cloud Shell command"
            placeholder="Type gcloud or gsutil command"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-white outline-none border-none font-mono text-xs focus:ring-0 p-0"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
          />
        </form>
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
