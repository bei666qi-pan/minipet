import type { PetState } from "./store/settingsStore";

export const PET_STATES: Array<{ key: PetState; label: string; fileName: string; description: string }> = [
  { key: "idle_welcome", label: "空闲欢迎", fileName: "Idle_Welcome.png", description: "默认站立、微笑、欢迎用户" },
  { key: "listening", label: "倾听", fileName: "Listening.png", description: "用户说话、语音输入、等待指令" },
  { key: "thinking", label: "思考", fileName: "Thinking.png", description: "AI 正在分析、规划任务" },
  { key: "working_guide", label: "工作讲解", fileName: "Working_Guide.png", description: "拿板子/指示，适合解释任务、展示计划" },
  { key: "success_cheer", label: "完成庆祝", fileName: "Success_Cheer.png", description: "任务完成、整理成功、鼓励用户" },
  { key: "idle_calm", label: "安静待机", fileName: "Idle_Calm.png", description: "长时间挂在桌面时的低打扰状态" },
  { key: "sleepy_rest", label: "困倦休息", fileName: "Sleepy_Rest.png", description: "用户长时间无操作、夜间、休息提醒" },
  { key: "shy_smile", label: "害羞亲和", fileName: "Shy_Smile.png", description: "轻互动、初次见面、用户夸奖时" },
  { key: "surprised_alert", label: "惊讶提醒", fileName: "Surprised_Alert.png", description: "异常、突然有新任务、发现问题" },
  { key: "apology_sad", label: "委屈道歉", fileName: "Apology_Sad.png", description: "执行失败、权限不足、任务出错" },
  { key: "reminder_warning", label: "重要提醒", fileName: "Reminder_Warning.png", description: "高危操作确认、不要忘记、提醒事项" },
  { key: "laptop_working", label: "电脑工作", fileName: "Laptop_Working.png", description: "正在调用 OpenClaw、整理文件、写总结" },
  { key: "dragging", label: "拖拽中", fileName: "pet_dragging.png", description: "用户按住桌宠并开始拖动时显示" }
];
