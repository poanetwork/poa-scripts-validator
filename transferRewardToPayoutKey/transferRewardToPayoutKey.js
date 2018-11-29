var fs = require('fs');
var toml = require('toml');
var getConfig = require('./utils/getConfig');
var configureWeb3 = require('./utils/configureWeb3');
var errorFinish = require('./utils/errorResponse');

var tomlPath = process.argv[2] || '../node.toml';

var rpc;
var config;
var web3;
var keysManager;
var polling_id;

var SCRIPT_TIMEOUT_SEC = 500; // 2*50 blocks
if (SCRIPT_TIMEOUT_SEC) {
	setTimeout(function () {
		throw new Error("Script is taking too long to complete (> " + SCRIPT_TIMEOUT_SEC + "sec). Exiting");
	}, SCRIPT_TIMEOUT_SEC*1000);
}

transferRewardToPayoutKey();

async function transferRewardToPayoutKey() {
	try { 
		config = await getConfig(); 
	} catch (err) { 
		return errorFinish(err); 
	}
	
	rpc = process.env.RPC || config.Ethereum[config.environment].rpc || 'http://127.0.0.1:8545';
	var KeysManagerAddress = config.Ethereum.contracts.KeysManager.addr;
	var KeysManagerAbi = config.Ethereum.contracts.KeysManager.abi;

	try { 
		web3 = await configureWeb3(rpc); 
	} catch (err) { 
		return errorFinish(err); 
	}

	try { 
		keysManager = await new web3.eth.Contract(KeysManagerAbi, KeysManagerAddress); 
	} catch (err) { 
		return errorFinish(err); 
	}
	
	var miningKey;
	var payoutKey;
	try {
		[miningKey, payoutKey] = await findKeys();
	} catch(e) {
		return errorFinish(e);
	}

	console.log("miningKey = " + miningKey);
	console.log("payoutKey = " + payoutKey);
	if ( miningKey == "0x0000000000000000000000000000000000000000"
		|| payoutKey == "0x0000000000000000000000000000000000000000"
		|| !web3.utils.isAddress(miningKey)
		|| !web3.utils.isAddress(payoutKey)
	) {
		var err = {code: 500, title: "Error", message: "Payout key or mining key or both are undefined"};
		return errorFinish(err);
	}
	transferRewardToPayoutKeyTX(web3, miningKey, payoutKey);
}

function findKeys() {
	return new Promise((resolve, reject) => {
		fs.readFile(tomlPath, 'utf8', async function(err, _toml) {
			if (err) reject(err);

			var tomlData = toml.parse(_toml);
			var miningKey = tomlData.mining.engine_signer;
			var payoutKey;
			try {
				payoutKey = await keysManager.methods.getPayoutByMining(miningKey).call();
			} catch(e) {
				reject(e);
			}

			resolve([miningKey,payoutKey]);
		})
	})
}

async function transferRewardToPayoutKeyTX(web3, _from, _to) {
	var balance;
	try {
		balance = await web3.eth.getBalance(_from);
	} catch (e) {
		return errorFinish(e);
	}
	balance = big(balance)
	if (balance <= 0) {
		var err = {"code": 500, "title": "Error", "message": "Balance of mining key is empty"}
		return errorFinish(err);
	}
	console.log("balance from: " + balance);
	var gasPrice = web3.utils.toWei(big('0'), 'gwei');
	console.log("gas price: " + gasPrice);
	var estimatedGas = big(21000);
	console.log("estimated gas: " + estimatedGas);
	var amountToSend = balance.sub(estimatedGas.mul(gasPrice));
	console.log("amount to transfer: " + amountToSend);
	if (amountToSend <= 0) {
		var err = {"code": 500, "title": "Error", "message": "Insufficient balance of mining key"}
		return errorFinish(err);
	}

	var isMined = false;
	var txParams = {gas: estimatedGas, from: _from, to: _to, value: amountToSend, gasPrice: gasPrice};
	console.log(`txParams:\n${JSON.stringify(txParams, null, 3)}`);
	web3.eth.sendTransaction(txParams)
	.on('transactionHash', txHash => checkTxMined(txHash, pollingReceiptCheck))
	.on('receipt', (receipt) => {
		if (isMined) return;
		isMined = true;
		clearTimeout(polling_id);
	    finishScript(receipt, _from, _to);
	})
	.on('error', (err) => {
		if (isMined) return;
		errorFinish(err);
	});

	function pollingReceiptCheck(err, txHash, receipt) {
		if (isMined) return;
		if (err) return errorFinish(err);

		if (receipt) {
			if (receipt.blockNumber) {
				console.log(`${txHash} is mined from polling of tx receipt`)
				isMined = true;
				clearTimeout(polling_id);
				finishScript(receipt, _from, _to);
			} else {
				repeatPolling();
			}
		} else {
			repeatPolling();
		}

		function repeatPolling() {
			console.log(`${txHash} is still pending. Polling of transaction once more`)
			polling_id = setTimeout(() => checkTxMined(txHash, pollingReceiptCheck), 5000)
		}
	}
}

function big(x) {
	return new web3.utils.BN(x);
}

function checkTxMined(txHash, _pollingReceiptCheck) {
	web3.eth.getTransactionReceipt(txHash, (err, receipt) => {
		_pollingReceiptCheck(err, txHash, receipt)
	})
}

function finishScript(receipt, miningKey, payoutKey) {
	console.log(`Transaction receipt:\n${JSON.stringify(receipt, null, 3)}`)
	console.log(`Reward is sent with tx ${receipt.transactionHash} to payout key (${payoutKey}) from mining key (${miningKey})`);
}
