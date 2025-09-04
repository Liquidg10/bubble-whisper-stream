export interface SearchMatch {
  bubble: any;
  score: number;
  reasons: MatchReason[];
}

export interface MatchReason {
  field: 'content' | 'tags' | 'type' | 'metadata' | 'timeRange';
  value: string;
  context?: string;
  weight: number;
}

export interface SearchFilter {
  id: string;
  name: string;
  query?: string;
  timeRange?: {
    start?: Date;
    end?: Date;
    preset?: 'today' | 'thisWeek' | 'thisMonth' | 'lastMonth';
  };
  types?: string[];
  tags?: string[];
  mood?: string[];
  people?: string[];
  domains?: string[];
  horizon?: string[];
  isFavorite?: boolean;
  createdAt: Date;
}

export interface SearchIndex {
  textIndex: Map<string, Set<string>>; // word -> bubble IDs
  tagIndex: Map<string, Set<string>>; // tag -> bubble IDs
  typeIndex: Map<string, Set<string>>; // type -> bubble IDs
  timeIndex: Map<string, Set<string>>; // date key -> bubble IDs
  peopleIndex: Map<string, Set<string>>; // person -> bubble IDs
  domainIndex: Map<string, Set<string>>; // domain -> bubble IDs
  lastBuilt: Date;
  bubbleCount: number;
}