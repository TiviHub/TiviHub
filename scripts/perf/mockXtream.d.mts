export const MOCK_USERNAME: string;
export const MOCK_PASSWORD: string;
export function startMockXtream(options?: { size?: "S" | "M" | "L" | "XL"; port?: number }): Promise<{
  port: number;
  url: string;
  close: () => Promise<void>;
}>;
