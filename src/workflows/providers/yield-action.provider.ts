import { Injectable, Logger } from '@nestjs/common';
import { ActionProvider, ActionResult } from '../action-provider';
import { YieldClient } from '../../yield/yield.client';

@Injectable()
export class YieldActionProvider implements ActionProvider {
  private readonly logger = new Logger(YieldActionProvider.name);

  constructor(private readonly yieldClient: YieldClient) {}

  async createAction(input: {
    intent: string;
    yieldId: string;
    address: string;
    arguments: Record<string, unknown>;
    action?: string;
    passthrough?: Record<string, unknown>;
  }): Promise<ActionResult> {
    // Verify yield exists
    await this.yieldClient.getYield(input.yieldId);

    let response: any;

    switch (input.intent) {
      case 'enter':
        response = await this.yieldClient.enter({
          yieldId: input.yieldId,
          address: input.address,
          arguments: input.arguments,
        });
        break;
      case 'exit':
        response = await this.yieldClient.exit({
          yieldId: input.yieldId,
          address: input.address,
          arguments: input.arguments,
        });
        break;
      case 'manage':
        response = await this.yieldClient.manage({
          yieldId: input.yieldId,
          address: input.address,
          arguments: input.arguments,
          action: input.action,
          passthrough: input.passthrough,
        });
        break;
      default:
        throw new Error(`Unknown intent: ${input.intent}`);
    }

    this.logger.log(
      `Yield action created: ${input.intent} for ${input.yieldId}, ${response.transactions?.length || 0} txs`,
    );

    return {
      yieldId: response.yieldId || input.yieldId,
      transactions: (response.transactions || []).map((tx: any, i: number) => ({
        id: tx.id,
        stepIndex: tx.stepIndex ?? i,
        network: tx.network,
        title: tx.title || `step-${i}`,
        unsignedTransaction: tx.unsignedTransaction,
        structuredTransaction: tx.structuredTransaction,
        annotatedTransaction: tx.annotatedTransaction,
        isMessage: tx.isMessage ?? false,
      })),
    };
  }
}
