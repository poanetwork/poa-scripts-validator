var fs = require('fs');
var Web3 = require('web3');
var toml = require('toml');

var tomlPath = process.argv[2] || '../node.toml';

var config = getConfig();

transferRewardToPayoutKey();

function transferRewardToPayoutKey() {
	findKeys(findKeysCallBack);
}

function findKeys(cb) {
	var tomlDataStr = fs.readFileSync(tomlPath, 'utf8');

	var tomlData = toml.parse(tomlDataStr);
	var miningKey = tomlData.mining.engine_signer;
	retrievePayoutKey(miningKey, function(web3, payoutKey) {
		cb(web3, miningKey, payoutKey);
	});
}

function findKeysCallBack(web3, miningKey, payoutKey) {
	console.log("miningKey = " + miningKey);
	console.log("payoutKey = " + payoutKey);
	if (!miningKey || !payoutKey || payoutKey == "0x0000000000000000000000000000000000000000") {
		var err = {code: 500, title: "Error", message: "Payout key or mining key or both are undefined"};
		return finishScript(err);
	}
	transferRewardToPayoutKeyTX(web3, miningKey, payoutKey);
}

function retrievePayoutKey(miningKey, cb) {
	var contractAddress = config.Ethereum.contracts.KeysManager.addr;
	attachToContract(contractAddress, miningKey, retrievePayoutKeyCallBack, cb);
}

function retrievePayoutKeyCallBack(err, web3, contract, miningKey, cb) {
	if (err) return finishScript(err);
	contract.methods.getPayoutByMining(miningKey).call(function(err, payoutKey) {
		if (err) return finishScript(err);
		cb(web3, payoutKey);
	});
}

function getConfig() {
	var config = JSON.parse(fs.readFileSync('../config.json', 'utf8'));
	return config;
}

function configureWeb3(miningKey, cb) {
	var web3;
	if (typeof web3 !== 'undefined') web3 = new Web3(web3.currentProvider);
	else web3 = new Web3(new Web3.providers.HttpProvider(config.Ethereum[config.environment].rpc));

	if (!web3) return finishScript(err);
	
	web3.eth.net.isListening().then(function(isListening) {
		if (!isListening) {
			var err = {code: 500, title: "Error", message: "check RPC"};
			return finishScript(err);
		}

		web3.eth.defaultAccount = miningKey;
		cb(null, web3);
	}, function(err) {
		return finishScript(err);
	});
}

function attachToContract(contractAddress, miningKey, retrievePayoutKeyCallBack, cb) {
	configureWeb3(miningKey, function(err, web3) {
		if (err) return finishScript(err);

		var contractABI = config.Ethereum.contracts.KeysManager.abi;
		var contractInstance = new web3.eth.Contract(contractABI, contractAddress);
		
		if (retrievePayoutKeyCallBack) retrievePayoutKeyCallBack(null, web3, contractInstance, miningKey, cb);
	});
}

async function transferRewardToPayoutKeyTX(web3, _from, _to) {
	var balance = await web3.eth.getBalance(_from);
	balance = big(balance)
	if (balance <= 0) {
		var err = {"code": 500, "title": "Error", "message": "Balance of mining key is empty"}
		return finishScript(err);
	}
	console.log("balance from: " + balance);
	var gasPrice = web3.utils.toWei(big('1'), 'gwei');
	console.log("gas price: " + gasPrice);
	var estimatedGas = big(21000);
	console.log("estimated gas: " + estimatedGas);
	var amountToSend = balance.sub(estimatedGas.mul(gasPrice));
	console.log("amount to transfer: " + amountToSend);
	if (amountToSend <= 0) {
		var err = {"code": 500, "title": "Error", "message": "Insufficient balance of mining key"}
		return finishScript(err);
	}

	web3.eth.sendTransaction({gas: estimatedGas, from: _from, to: _to, value: amountToSend, gasPrice: gasPrice}, function(err, result) {
		finishScript(err, result, _from, _to);
	});

	function big(x) {
		return new web3.utils.BN(x);
	}
}

function finishScript(err, result, miningKey, payoutKey) {
	if (err) {
		console.log("Something went wrong with transferring reward to payout key");
		console.log(err.message);
		return;
	}

	console.log("Reward is sent to payout key (" + payoutKey + ") from mining key (" + miningKey + ")");
}
