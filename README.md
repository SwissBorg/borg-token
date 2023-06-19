# SwissBorg $BORG Token

BORG is an ERC-20 compatible token. It is developed to replace the current SwissBorg token, the CHSB, with a more lightweight design and an updated code.

Coming with the BORG is a migrator contract to allow people to seamlessly migrate from CHSB to BORG.

## Installation

First, you need to setup the environment:

- `cp .env.example .env`
```
ETHERSCAN_KEY=
PRIVATE_KEY=
```

While the Etherscan key is only necessary for the verification of the contracts, the private key is required for the compilation as some networks use it.

Then you can proceed with:

- `npm install`
- `npx hardhat compile`

## Contracts

### SwissBorgToken.sol

This contract represents the new BORG token. It is a simple ERC20 implementing three extensions from OpenZeppelin:

- `ERC20Burnable`: which allows real "burn" of the tokens, updating the total supply.
- `ERC20Permit`: which is a gas-less alternative to approvals
- `ERC20Votes`: which tracks historical balances for voting in on-chain governance, with a way to delegate one's voting power to a trusted account.

While the CHSB initial supply was hardcoded to 1 billion, the BORG initial supply will take into account the tokens sent to `address(0)` to not mint tokens that can't be migrated.

When created, the supply will be directly transferred to the migrator which is in charge of exchanging CHSB tokens for BORG tokens.

No roles are available on this contract. 

No proxy is implemented in front of the contract.

_The `SwissBorgToken` is released under the MIT license._

### ChsbToBorgMigrator.sol

This contract is the migrator. The logic is inspired by Aave's [LendToAaveMigrator](https://github.com/aave/aave-token-v2/blob/master/contracts/token/LendToAaveMigrator.sol).

As for the SwissBorgToken, it is also implementing code from OpenZeppelin.

It is composed of one main function which is `migrate(uint256 _amount)`. This method transfers from `msg.sender` an `_amount` of CHSB and transfers to the sender the equivalent amount of BORG.

The exchange rate is `1 CHSB = 1 * (10 ** 10) BORG`. This is because the CHSB has 8 decimals, while the BORG has 18 decimals.

A `UUPSUpgradeable` proxy is implemented in front of this contract. The proxy upgradeability role is defined just below.

The contract is composed of two roles:
- `owner`: which can upgrade the contract and set a new manager.
  - The `owner` will be a 5-out-of-7 multisig. Its composition is in the process of being decided. A 48-hour Timelock will be in front of the multisig.
- `manager`: which can pause the migration.
  - The `manager` will be a 3-out-of-5 multisig. Its composition is in the process of being decided. This will feature no Timelock as the goal is to be able to pause the contract in case anything wrong happens.

_The `ChsbToBorgMigrator` is released under the AGPL 3.0 license._

### mock/MintableErc20.sol

A simple mock token contract where tokens can be minted freely.

### mock/MockChsbToBorgMigratorV2.sol

A mock contract similar to the `ChsbToBorgMigrator` with one extra constant that is used to test the upgradeability of the contract.

See `test/ChsbToBorgMigrator.ts`, `Upgrade` case.

## Tests

A full suite of tests is written in Typescript and accessible in the `test/` folder.

To run the tests, execute: `npx hardhat test`.

All tests can also be run independently with `npx hardhat test test/<filename>.ts` with the exception of `ChsbToBorgMigrator.ts`; please see the note in the section of this file.

### ChsbToMigrator.ts

This is the main file testing the scenarios with the `ChsbToBorgMigrator`.

One edge case is covered in the following file.

_Note: This test **can't** be run alone. This is due to a limitation of `hardhat-upgrades`. If you want to run it alone (`npx hardhat run tests/ChsbToBorgMigrator.ts`, please refer to the comment about the `migratorAddress` in the main `before()`._

### ChsbToBorgMigrator-Safeguard.ts

As the CHSB contract is quite old and outdated, the SwissBorg team is afraid that it could be exploited to mint an infinite amount of tokens in the future. This would put at risk any on-going migration process.

Therefore, the `ChsbToBorgMigrator` implements one key safeguard which is to check before any migration that the CHSB supply is still 1 billion (the initial supply).

This edge case is covered in this file with the help of mock contracts.

### SwissBorgToken.ts

This file covers the required tests for the `SwissBorgToken` contract.

### Coverage

The coverage can be run with: `npx hardhat coverage`.

This is the output:

```
-------------------------|----------|----------|----------|----------|----------------|
File                     |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
-------------------------|----------|----------|----------|----------|----------------|
 contracts/              |      100 |      100 |      100 |      100 |                |
  ChsbToBorgMigrator.sol |      100 |      100 |      100 |      100 |                |
  SwissBorgToken.sol     |      100 |      100 |      100 |      100 |                |
-------------------------|----------|----------|----------|----------|----------------|
All files                |      100 |      100 |      100 |      100 |                |
-------------------------|----------|----------|----------|----------|----------------|
```

The coverage does not cover the mocks as they will not be deployed and are only used for the tests.

## Deployment

A deployment script is made available in the `scripts/` folder.

It requires to set the relevant values on top of the file and then the deployment can be done with `npx hardhat run scripts/deploy.ts --network ethereum`

The verification of the contract is automatically done after deploying the contracts through the `hardhat-etherscan` plugin.

## Lint

### Solidity

The Solidity code provided is linted with `solhint` to comply with the style guide. 

To lint a file, run: `npx solhint contracts/<file>.sol`

### Typescript

Typescript linting is done automatically when you commit with `husky`, `lint-staged` and `prettier`.

You can also run it with: `npm run prettier`

## Links

### Test deployment

- `CHSB`: [`0x70aE3b93a49cA26abF80D8B26d5cf58087dC1bd5`](https://sepolia.etherscan.io/address/0x70ae3b93a49ca26abf80d8b26d5cf58087dc1bd5)
- `BORG`: [`0xC5a86570bb55c1109c92A9523F93fE6a89dE2C77`](https://sepolia.etherscan.io/address/0xc5a86570bb55c1109c92a9523f93fe6a89de2c77)
- `ChsbToBorgMigrator` Proxy: [`0x679CFB1c44Ff46D8847ff339a1654BF38a551EFe`](https://sepolia.etherscan.io/address/0x679cfb1c44ff46d8847ff339a1654bf38a551efe)
- `ChsbToBorgMigrator` Implementation: [`0x3C0801025bE09463476359FB4c85eb2f2577D4E7`](https://sepolia.etherscan.io/address/0x3c0801025be09463476359fb4c85eb2f2577d4e7)
- `Owner`: [`0x7d4e1c945651017ecb1911d037d6186671fe0b43`](https://sepolia.etherscan.io/address/0x7d4e1c945651017ecb1911d037d6186671fe0b43)
- `Manager`: [`0x7d4e1c945651017ecb1911d037d6186671fe0b43`](https://sepolia.etherscan.io/address/0x7d4e1c945651017ecb1911d037d6186671fe0b43)

#### Transactions:

- Creation of the token with `BORG` minted tokens transferred to `ChsbToBorgMigrator` proxy: [`0x7689292cbef6a1839ae404f65f50af06ddf29d612cdd3a21750b50c8767e4085`](https://sepolia.etherscan.io/tx/0x7689292cbef6a1839ae404f65f50af06ddf29d612cdd3a21750b50c8767e4085)
- Migrate 100 CHSB to BORG: [`0x5ad64d5f16d6a3b60771318f45ea0688e076e9771df1e4e5f2f6261b900506ee`](https://sepolia.etherscan.io/tx/0x5ad64d5f16d6a3b60771318f45ea0688e076e9771df1e4e5f2f6261b900506ee)

### General

- SwissBorg: [swissborg.com](https://swissborg.com)
- CHSB: [Etherscan](https://etherscan.io/address/0xba9d4199fab4f26efe3551d490e3821486f135ba)