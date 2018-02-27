# Scripts for Validator node

## Transfer of reward from mining key to payout key

Script is located in `./transferRewardToPayoutKey` folder. 
It transfers the whole balance at the moment of execution of the script from validator's key address to payout key address. It is [a part of MoC setup](https://github.com/poanetwork/wiki/wiki/Master-of-Ceremony-Setup#repository-with-scripts-for-validator-node) and it is a part of deployment playbooks for [AWS](https://github.com/poanetwork/wiki/wiki/Validator-Node-on-AWS) and [non AWS](https://github.com/poanetwork/wiki/wiki/Validator-Node-Non-AWS) setups.
Script's key features:
- it takes mining key address from `node.toml` configuration file for launching validator's Parity client.
- it gets payout key from [POA Network Consensus smart-contracts](https://github.com/poanetwork/poa-network-consensus-contracts).
- it transfers a full balance from mining to payout key.

Transfer of reward has configured to execute once in an hour on the validator's node.