//finalizes script, if error arised
function errorFinish(err) {
	console.log("Something went wrong with transferring reward to payout key");
	if (err) {
		console.log(err.message);
	}
}

module.exports = errorFinish
