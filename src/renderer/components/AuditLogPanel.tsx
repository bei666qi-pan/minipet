import { FileText, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export function AuditLogPanel() {
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const result = await window.minipet.invoke<Array<Record<string, unknown>>>("audit:read");
    setLogs(result);
  }

  return (
    <section className="panel-section">
      <div className="section-title">
        <FileText size={17} />
        <span>日志与诊断</span>
        <button onClick={() => void refresh()} title="刷新">
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="log-list">
        {logs.length === 0 ? <p className="hint">暂无审计日志。</p> : null}
        {logs.map((entry, index) => (
          <pre key={index}>{JSON.stringify(entry, null, 2)}</pre>
        ))}
      </div>
    </section>
  );
}
