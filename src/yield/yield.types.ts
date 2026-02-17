export interface YieldTransaction {
  id: string;
  stepIndex: number;
  network: string;
  title: string;
  unsignedTransaction: any;
  annotatedTransaction?: any;
  structuredTransaction?: any;
  isMessage: boolean;
}

export interface YieldActionResult {
  yieldId: string;
  address: string;
  arguments?: any;
  transactions: YieldTransaction[];
}
