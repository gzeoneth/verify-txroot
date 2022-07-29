import Common, { Hardfork } from '@ethereumjs/common'
import { TransactionFactory } from '@ethereumjs/tx'
import { BaseTrie } from 'merkle-patricia-tree'
import { ethers } from "ethers"
import rlp from 'rlp'
import dotenv from 'dotenv'
import { bigIntToUnpaddedBuffer, toBuffer } from '@ethereumjs/util'
dotenv.config()

const main = async (blocknumber: number, provider: ethers.providers.JsonRpcProvider) => {
    const chainid = (await provider.getNetwork()).chainId
    const block = await provider.send('eth_getBlockByNumber', [`0x${blocknumber.toString(16)}`, true]);
    const common = Common.custom(
        {
            name: 'Custom',
            chainId: chainid,
            networkId: chainid,
        },
        {
            hardfork: Hardfork.London
        }
    )

    // Construct a Patricia trie, using each transaction's index as the key, and the
    // raw transaction body as the value.
    const trie = new BaseTrie()
    for (let i = 0; i < block.transactions.length; i++) {
        const _tx = block.transactions[i]
        const _tx_type = parseInt(_tx.type, 16)
        let txrlpbuffer
        switch (_tx_type) {
            case 0:
            case 1:
            case 2:
                const tx = TransactionFactory.fromTxData({
                    ..._tx,
                    gasLimit: _tx.gas,
                    data: _tx.input,
                    type: _tx_type > 2 ? undefined : _tx_type,
                    v: _tx.v === '0x0' ? undefined : _tx.v,
                }, { common: common })
                txrlpbuffer = tx.serialize()
                break;
            // https://github.com/OffchainLabs/go-ethereum/blob/master/core/types/arb_types.go
            case 100: // ArbitrumDepositTxType
                txrlpbuffer = Buffer.concat([new Uint8Array([_tx_type]), rlp.encode([
                    bigIntToUnpaddedBuffer(BigInt(_tx.chainId)),
                    _tx.requestId,
                    _tx.from,
                    _tx.to,
                    bigIntToUnpaddedBuffer(BigInt(_tx.value))
                ])])
                break;
            case 104: // ArbitrumRetryTxType
                txrlpbuffer = Buffer.concat([new Uint8Array([_tx_type]), rlp.encode([
                    bigIntToUnpaddedBuffer(BigInt(_tx.chainId)),
                    bigIntToUnpaddedBuffer(BigInt(_tx.nonce)),
                    _tx.from,
                    bigIntToUnpaddedBuffer(BigInt(_tx.maxFeePerGas)),
                    bigIntToUnpaddedBuffer(BigInt(_tx.gas)),
                    _tx.to,
                    bigIntToUnpaddedBuffer(BigInt(_tx.value)),
                    _tx.input,
                    _tx.ticketId,
                    _tx.refundTo,
                    bigIntToUnpaddedBuffer(BigInt(_tx.maxRefund)),
                    bigIntToUnpaddedBuffer(BigInt(_tx.submissionFeeRefund))
                ])])
                break;
            case 105: // ArbitrumSubmitRetryableTxType
                txrlpbuffer = Buffer.concat([new Uint8Array([_tx_type]), rlp.encode([
                    bigIntToUnpaddedBuffer(BigInt(_tx.chainId)),
                    _tx.requestId,
                    _tx.from,
                    bigIntToUnpaddedBuffer(BigInt(_tx.l1BaseFee)),
                    bigIntToUnpaddedBuffer(BigInt(_tx.depositValue)),
                    bigIntToUnpaddedBuffer(BigInt(_tx.maxFeePerGas)),
                    bigIntToUnpaddedBuffer(BigInt(_tx.gas)),
                    _tx.retryTo,
                    bigIntToUnpaddedBuffer(BigInt(_tx.retryValue)),
                    _tx.beneficiary,
                    bigIntToUnpaddedBuffer(BigInt(_tx.maxSubmissionFee)),
                    _tx.refundTo,
                    _tx.retryData
                ])])
                break;
            case 106: // ArbitrumInternalTx
                txrlpbuffer = Buffer.concat([new Uint8Array([_tx_type]), rlp.encode([
                    bigIntToUnpaddedBuffer(BigInt(_tx.chainId)),
                    _tx.input
                ])])
                break;
            case 120: // ArbitrumSubmitSignedTxType
                txrlpbuffer = Buffer.from(rlp.encode([
                    bigIntToUnpaddedBuffer(BigInt(_tx.nonce)),
                    bigIntToUnpaddedBuffer(BigInt(_tx.gasPrice)),
                    bigIntToUnpaddedBuffer(BigInt(_tx.gas)),
                    _tx.to,
                    bigIntToUnpaddedBuffer(BigInt(_tx.value)),
                    _tx.input,
                    bigIntToUnpaddedBuffer(BigInt(_tx.v)),     
                    bigIntToUnpaddedBuffer(BigInt(_tx.r)),     
                    bigIntToUnpaddedBuffer(BigInt(_tx.s)),               
                ]))
                break;
            case 101: // ArbitrumUnsignedTxType
            case 102: // ArbitrumContractTxType
            default:
                throw Error(`unimplemeted type ${_tx_type}`)
        }
        await trie.put(
            toBuffer(rlp.encode(i)),
            txrlpbuffer,
        )
    }
    console.log(`Block ${blocknumber} has ${block.transactions.length} transactions`)
    console.log(`Expected tx root: ${block.transactionsRoot}`)
    console.log(`Actual   tx root: 0x${trie.root.toString('hex')}`)
}

if (!process.env.ARCHIVE_RPC) {
    console.log("ARCHIVE_RPC envvar not set")
    process.exit(1)
}
const provider = new ethers.providers.JsonRpcProvider(process.env.ARCHIVE_RPC);
if (!process.env.BLOCK_NUMBER) {
    console.log("BLOCK_NUMBER envvar not set")
    process.exit(1)
}
const blocknumber = parseInt(process.env.BLOCK_NUMBER);
main(blocknumber, provider).then(() => console.log('Done.'))
