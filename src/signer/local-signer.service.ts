import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Wallet } from 'ethers';
import { AppConfigService } from '../config/config.service';
import { ErrorCodes } from '../common/errors';

@Injectable()
export class LocalSignerService {
  private readonly logger = new Logger(LocalSignerService.name);
  private wallet: Wallet | null = null;
  private signerAddress: string = '';

  constructor(private readonly config: AppConfigService) {
    if (config.signerPrivateKey) {
      this.wallet = new Wallet(config.signerPrivateKey);
      this.signerAddress = this.wallet.address.toLowerCase();
      this.logger.log(`Signer initialized: ${this.signerAddress}`);
    } else {
      this.logger.warn('SIGNER_PRIVATE_KEY not set — signing will fail');
    }
  }

  getAddress(): string {
    return this.signerAddress;
  }

  async signTransaction(
    unsignedTx: any,
    userAddress: string,
  ): Promise<string> {
    if (!this.wallet) {
      throw new InternalServerErrorException({
        statusCode: 500,
        code: ErrorCodes.SIGNER_NOT_CONFIGURED,
        message: 'Signer private key is not configured',
      });
    }

    // Enforce signer address matches workflow address
    if (userAddress.toLowerCase() !== this.signerAddress) {
      throw new BadRequestException({
        statusCode: 400,
        code: ErrorCodes.ADDRESS_MISMATCH,
        message: `Workflow address ${userAddress} does not match signer address ${this.signerAddress}`,
      });
    }

    // Parse unsigned tx — Yield returns it as a JSON string or object
    let parsed: Record<string, any>;
    if (typeof unsignedTx === 'string') {
      try {
        parsed = JSON.parse(unsignedTx);
      } catch {
        throw new BadRequestException({
          statusCode: 400,
          code: ErrorCodes.NETWORK_NOT_SUPPORTED,
          message: 'Failed to parse unsigned transaction',
        });
      }
    } else if (typeof unsignedTx === 'object' && unsignedTx !== null) {
      parsed = unsignedTx;
    } else {
      throw new BadRequestException({
        statusCode: 400,
        code: ErrorCodes.NETWORK_NOT_SUPPORTED,
        message: 'Unsigned transaction is not a valid object or string',
      });
    }

    // Validate EVM basics
    if (!parsed.to || !parsed.data) {
      throw new BadRequestException({
        statusCode: 400,
        code: ErrorCodes.NETWORK_NOT_SUPPORTED,
        message: 'Missing required EVM tx fields (to, data)',
      });
    }

    // Validate from matches signer if present
    if (parsed.from && parsed.from.toLowerCase() !== this.signerAddress) {
      throw new BadRequestException({
        statusCode: 400,
        code: ErrorCodes.ADDRESS_MISMATCH,
        message: `Transaction "from" field ${parsed.from} does not match signer address`,
      });
    }

    // Build ethers TransactionRequest — pass through all fields as-is
    const txRequest: Record<string, any> = {};
    if (parsed.to) txRequest.to = parsed.to;
    if (parsed.data) txRequest.data = parsed.data;
    if (parsed.value !== undefined) txRequest.value = parsed.value;
    if (parsed.nonce !== undefined) txRequest.nonce = parsed.nonce;
    if (parsed.gasLimit !== undefined) txRequest.gasLimit = parsed.gasLimit;
    if (parsed.gasPrice !== undefined) txRequest.gasPrice = parsed.gasPrice;
    if (parsed.maxFeePerGas !== undefined) txRequest.maxFeePerGas = parsed.maxFeePerGas;
    if (parsed.maxPriorityFeePerGas !== undefined)
      txRequest.maxPriorityFeePerGas = parsed.maxPriorityFeePerGas;
    if (parsed.chainId !== undefined) txRequest.chainId = parsed.chainId;
    if (parsed.type !== undefined) txRequest.type = parsed.type;

    try {
      const signedTx = await this.wallet.signTransaction(txRequest);
      return signedTx;
    } catch (error) {
      this.logger.error(`Signing failed: ${(error as Error).message}`);
      throw new InternalServerErrorException({
        statusCode: 500,
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Transaction signing failed',
      });
    }
  }
}
