import Common from '@ethereumjs/common'
import { Transaction } from 'ethereumjs-tx'
import { BaseTrie } from 'merkle-patricia-tree'
import { ethers } from "ethers"
import { rlp } from 'ethereumjs-util'
import dotenv from 'dotenv'
dotenv.config()

const main = async (blocknumber: number, provider: ethers.providers.JsonRpcProvider) => {
    const chainid = (await provider.getNetwork()).chainId
    const block = await provider.send('eth_getBlockByNumber', [`0x${blocknumber.toString(16)}`, true]);
    const common = new Common({
        chain: "Custom", customChains: [[{
            name: "Custom",
            chainId: chainid,
            networkId: chainid,
            comment: "",
            url: "",
            genesis: {
                "hash": "",
                "timestamp": null,
                "gasLimit": 0,
                "difficulty": 0,
                "nonce": "",
                "extraData": "",
                "stateRoot": ""
            },
            hardforks: [],
            bootstrapNodes: [],
        }, {}
        ]]
    });

    // Construct a Patricia trie, using each transaction's index as the key, and the
    // raw transaction body as the value.
    const trie = new BaseTrie()
    for (let i = 0; i < block.transactions.length; i++) {
        const tx = block.transactions[i]
        if (tx.v === '0x0') {
            // there are certrain arbitrum transaction that don't have signature
            delete tx.v
            delete tx.r
            delete tx.s
        }
        await trie.put(
            rlp.encode(i),
            new Transaction(tx, { common: common as any }).serialize()
        )
    }
    console.log(`Block ${blocknumber} has ${block.transactions.length} transactions`)
    console.log(`Expected tx root: ${block.transactionsRoot}`)
    console.log(`Actual   tx root: 0x${trie.root.toString('hex')}`)
}

if (!process.env.ARCHIVE_RPC){
    console.log("ARCHIVE_RPC envvar not set")
    process.exit(1)
}
const provider = new ethers.providers.JsonRpcProvider(process.env.ARCHIVE_RPC);
if (!process.env.BLOCK_NUMBER){
    console.log("BLOCK_NUMBER envvar not set")
    process.exit(1)
}
const blocknumber = parseInt(process.env.BLOCK_NUMBER);
main(blocknumber, provider).then(() => console.log('Done.'))