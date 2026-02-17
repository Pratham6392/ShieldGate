export interface TransactionLike {
  id?: string;
  stepIndex: number;
  network: string;
  title: string;
  unsignedTransaction: any;
  structuredTransaction?: any;
  annotatedTransaction?: any;
  isMessage?: boolean;
}

export interface ActionResult {
  yieldId: string;
  transactions: TransactionLike[];
}

export interface ActionProvider {
  createAction(input: {
    intent: string;
    yieldId: string;
    address: string;
    arguments: Record<string, unknown>;
    action?: string;
    passthrough?: Record<string, unknown>;
  }): Promise<ActionResult>;
}

export const ACTION_PROVIDER = 'ACTION_PROVIDER';
