export interface UserProfile {
  nickname: string;
  focus_areas: string;
  current_goals: string;
  communication_style: string;
  notes: string;
  gender: string;
  calendar_type: string;
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
  birth_hour: number | null;
  birth_minute: number;
  birth_place: string | null;
  use_true_solar_time: boolean;
  bazi_note: string | null;
  birth_info: string;
}

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  type: string;
  message: string;
  answer: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: number;
}

export interface BirthInfo {
  name: string;
  gender?: string;
  calendar_type?: string;
  birth_year: number;
  birth_month: number;
  birth_day: number;
  birth_hour: number;
  birth_minute?: number;
  birth_place?: string;
  use_true_solar_time?: boolean;
  note?: string;
}

export interface BaziChart {
  type: string;
  chart: Record<string, unknown>;
}

export interface BaziAnalyzeRequest extends BirthInfo {
  focus?: string;
}

export interface BaziAnalyzeResponse {
  type: string;
  chart: Record<string, unknown>;
  answer: string;
}

export interface BaziQuestion {
  birth_info: BirthInfo;
  question: string;
  focus?: string;
}

export interface BaziQuestionResponse {
  type: string;
  chart: Record<string, unknown>;
  question: string;
  answer: string;
}

export interface TarotRequest {
  question: string;
  spread?: string;
}

export interface TarotResponse {
  type: string;
  question: string;
  cards: Record<string, unknown>[];
  answer: string;
}

export interface YijingRequest {
  question: string;
}

export interface YijingResponse {
  type: string;
  question: string;
  gua: Record<string, unknown>;
  answer: string;
}

export interface DailyFortuneResponse {
  type: string;
  seed: Record<string, unknown>;
  answer: string;
}

export interface TodoItem {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  notes: string;
  done: boolean;
}

export interface ScheduleEvent {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  category: 'study' | 'project' | 'life' | 'deadline' | 'other';
  notes: string;
}
