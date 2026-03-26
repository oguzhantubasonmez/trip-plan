export type DiscoverQuest = {
  id: string;
  emoji: string;
  title: string;
  /** 0..target */
  progress: number;
  target: number;
  done: boolean;
};

export type DiscoverLeaderboardRow = {
  uid: string;
  displayName: string;
  score: number;
  isSelf: boolean;
};

/** Tek anket şıkkı (kimlik = dizin string: "0", "1", …) */
export type PollOptionEntry = {
  id: string;
  text: string;
  count: number;
};

export type DiscoverPollState = {
  pollId: string;
  question: string;
  options: PollOptionEntry[];
  /** Seçilen şıkkın id’si; oy yoksa null */
  userChoice: string | null;
  totalVotes: number;
  /** Keşfet anketi: belgeyi sen oluşturdun */
  isCreator?: boolean;
};
