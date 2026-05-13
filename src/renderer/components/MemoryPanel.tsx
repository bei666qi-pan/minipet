import { Brain, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useSettingsStore } from "../store/settingsStore";

interface MemoryRecord {
  id: string;
  kind: string;
  text: string;
  tags: string[];
  importance: number;
  sensitivity: "normal" | "sensitive";
  source: "auto" | "explicit";
  updatedAt: string;
}

export function MemoryPanel() {
  const { settings, update } = useSettingsStore();
  const [memories, setMemories] = useState<MemoryRecord[]>([]);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setMemories(await window.minipet.invoke<MemoryRecord[]>("memory:list"));
  }

  async function remove(id: string) {
    await window.minipet.invoke("memory:delete", { id });
    await refresh();
  }

  async function clear() {
    await window.minipet.invoke("memory:clear");
    await refresh();
  }

  if (!settings) return null;

  return (
    <section className="panel-section">
      <div className="section-title">
        <Brain size={18} />
        <span>长期记忆</span>
      </div>
      <label className="checkbox-line">
        <input type="checkbox" checked={settings.memoryEnabled} onChange={(event) => void update({ memoryEnabled: event.target.checked })} />
        <span>允许爪爪在本机保存长期记忆</span>
      </label>
      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={settings.memoryAutoExtractEnabled}
          disabled={!settings.memoryEnabled}
          onChange={(event) => void update({ memoryAutoExtractEnabled: event.target.checked })}
        />
        <span>自动记住偏好、称呼、长期项目和重要事件</span>
      </label>
      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={settings.memoryUseModelCompression}
          disabled={!settings.memoryEnabled}
          onChange={(event) => void update({ memoryUseModelCompression: event.target.checked })}
        />
        <span>使用当前模型压缩长上下文</span>
      </label>
      <div className="memory-list">
        {memories.length ? (
          memories.slice(0, 12).map((memory) => (
            <div className="memory-row" key={memory.id}>
              <div>
                <strong>{memory.text}</strong>
                <p className="hint">
                  {memory.kind} / {memory.source} / 重要性 {memory.importance.toFixed(1)}
                </p>
              </div>
              <button title="删除记忆" onClick={() => void remove(memory.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))
        ) : (
          <p className="hint">还没有长期记忆。你可以直接说“记住：我喜欢……”。</p>
        )}
      </div>
      {memories.length ? <button onClick={() => void clear()}>清空全部记忆</button> : null}
    </section>
  );
}
