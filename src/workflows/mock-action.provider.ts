import { Injectable } from '@nestjs/common';
import { ActionProvider, ActionResult } from './action-provider';

@Injectable()
export class MockActionProvider implements ActionProvider {
  async createAction(input: {
    intent: string;
    yieldId: string;
    address: string;
    arguments: Record<string, unknown>;
    action?: string;
  }): Promise<ActionResult> {
    return {
      yieldId: input.yieldId,
      transactions: [
        {
          stepIndex: 0,
          network: 'eip155:11155111',
          title: 'approve',
          unsignedTransaction: {
            to: '0x1111111111111111111111111111111111111111',
            data: '0x095ea7b30000000000000000000000002222222222222222222222222222222222222222ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
            value: '0',
            chainId: 11155111,
            type: 2,
            maxFeePerGas: '30000000000',
            maxPriorityFeePerGas: '1000000000',
            gasLimit: '60000',
            nonce: 0,
          },
        },
        {
          stepIndex: 1,
          network: 'eip155:11155111',
          title: 'enter',
          unsignedTransaction: {
            to: '0x2222222222222222222222222222222222222222',
            data: '0xa59f3e0c0000000000000000000000000000000000000000000000000000000000000001',
            value: '0',
            chainId: 11155111,
            type: 2,
            maxFeePerGas: '30000000000',
            maxPriorityFeePerGas: '1000000000',
            gasLimit: '120000',
            nonce: 1,
          },
        },
      ],
    };
  }
}
