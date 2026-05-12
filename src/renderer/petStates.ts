import type { PetState } from "./store/settingsStore";

export const PET_STATES: Array<{ key: PetState; label: string }> = [
  { key: "idle", label: "空闲欢迎" },
  { key: "listening", label: "倾听" },
  { key: "thinking", label: "思考" },
  { key: "searching", label: "联网搜索" },
  { key: "making_ppt", label: "制作 PPT" },
  { key: "browsing", label: "浏览器控制" },
  { key: "file_working", label: "文件处理" },
  { key: "success", label: "完成庆祝" },
  { key: "error", label: "出错道歉" },
  { key: "sleeping", label: "安静休息" },
  { key: "warning", label: "重要提醒" }
];
