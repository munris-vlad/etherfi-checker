import {
    getKeyByValue,
    readWallets,
    timestampToDate
} from './common.js'
import axios from "axios"
import {Table} from 'console-table-printer'
import {createObjectCsvWriter} from 'csv-writer'
import cliProgress from 'cli-progress'
import {HttpsProxyAgent} from "https-proxy-agent"
import {SocksProxyAgent} from "socks-proxy-agent"

let columns = [
    { name: 'n', color: 'green', alignment: "right"},
    { name: 'wallet', color: 'green', alignment: "right"},
    { name: 'loyaltyPoints', color: 'green', alignment: "right"},
    { name: 'eigenlayerPoints', color: 'green', alignment: "right"},
]

let headers = [
    { id: 'n', title: '№'},
    { id: 'wallet', title: 'wallet'},
    { id: 'loyaltyPoints', title: 'loyaltyPoints'},
    { id: 'eigenlayerPoints', title: 'eigenlayerPoints'},
]

let debug = false
let p
let csvWriter
let wallets = readWallets('./wallets.txt')
let proxies = readWallets('./proxies.txt')
let iterations = wallets.length
let iteration = 1
let stats = []
let csvData = []
let totalEigenlayerPoints = 0
let totalLoyaltyPoints = 0
const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)

async function getBalance(wallet, proxy = null) {
    let config = {
        timeout: 5000
    }
    if (proxy) {
        if (proxy.includes('http')) {
            config.httpsAgent = new HttpsProxyAgent(proxy)
        }

        if (proxy.includes('socks')) {
            config.httpsAgent = new SocksProxyAgent(proxy)
        }
    }

    let isBalancesFetched = false
    while (!isBalancesFetched) {
        await axios.get(`https://app.ether.fi/api/portfolio/${wallet}`, config).then(async response => {
            stats[wallet].loyaltyPoints = response.data.loyaltyPoints.toFixed(2)
            stats[wallet].eigenlayerPoints = response.data.eigenlayerPoints.toFixed(2)
            totalLoyaltyPoints += parseFloat(stats[wallet].loyaltyPoints)
            totalEigenlayerPoints += parseFloat(stats[wallet].eigenlayerPoints)
            isBalancesFetched = true
            
        }).catch(e => {
            isBalancesFetched = true
            if (debug) console.log('balances', e.toString())
        })
    }
}

async function fetchWallet(wallet, index) {

    let proxy = null
    if (proxies.length) {
        if (proxies[index]) {
            proxy = proxies[index]
        } else {
            proxy = proxies[0]
        }
    }

    stats[wallet] = {
        loyaltyPoints: 0,
        eigenlayerPoints: 0
    }

    await getBalance(wallet, proxy)

    progressBar.update(iteration)

    let row = {
        n: parseInt(index)+1,
        wallet: wallet,
        loyaltyPoints: stats[wallet].loyaltyPoints,
        eigenlayerPoints: stats[wallet].eigenlayerPoints,
    }

    p.addRow(row, { color: "cyan" })

    iteration++
}

async function fetchWallets() {
    iterations = wallets.length
    iteration = 1
    csvData = []
    
    let batchSize = 1
    let timeout = 1000

    if (proxies.length) {
        batchSize = 10
        timeout = 1000
    }

    const batchCount = Math.ceil(wallets.length / batchSize)
    const walletPromises = []

    p = new Table({
        columns: columns,
        sort: (row1, row2) => +row1.n - +row2.n
    })

    csvWriter = createObjectCsvWriter({
        path: './result.csv',
        header: headers
    })

    for (let i = 0; i < batchCount; i++) {
        const startIndex = i * batchSize
        const endIndex = (i + 1) * batchSize
        const batch = wallets.slice(startIndex, endIndex)

        const promise = new Promise((resolve) => {
            setTimeout(() => {
                resolve(fetchBatch(batch))
            }, i * timeout)
        })

        walletPromises.push(promise)
    }

    await Promise.all(walletPromises)

    return true
}

async function fetchBatch(batch) {
    await Promise.all(batch.map((account, index) => fetchWallet(account, getKeyByValue(wallets, account))))
}

async function saveToCsv() {
    p.table.rows.map((row) => {
        csvData.push(row.text)
    })
    csvData.sort((a, b) => a.n - b.n)
    csvWriter.writeRecords(csvData).then().catch()
}

async function addTotalRow() {
    p.addRow({})

    let row = {
        wallet: 'Total',
        loyaltyPoints: totalLoyaltyPoints,
        eigenlayerPoints: totalEigenlayerPoints,
    }

    p.addRow(row, { color: "cyan" })
}

progressBar.start(iterations, 0)
await fetchWallets()
await addTotalRow()
await saveToCsv()
progressBar.stop()
p.printTable()