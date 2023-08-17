import hre, { ethers, upgrades } from "hardhat";
import { ChsbToBorgMigrator, SwissBorgToken } from "../typechain-types";
import { nextDeterministicContractAddress } from "../test/utils/deterministicAddress";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

async function main() {
  // Contract params
  const chsbAddress = "0x70aE3b93a49cA26abF80D8B26d5cf58087dC1bd5";
  const owner = "0x7d4e1c945651017ecb1911D037d6186671FE0b43";
  const manager = "0x7d4e1c945651017ecb1911D037d6186671FE0b43";

  let deployer: SignerWithAddress;
  [deployer] = await ethers.getSigners();
  // Delta = 2 as we will deploy a proxy and an implementation
  const migratorAddress = await nextDeterministicContractAddress(deployer, 2);

  // Deploy BORG
  const borgArgs = [migratorAddress];
  const SwissBorgToken = await ethers.getContractFactory("SwissBorgToken", deployer);
  const borg = (await SwissBorgToken.deploy(migratorAddress)) as SwissBorgToken;

  // Deploy Migrator
  const migratorArgs = [chsbAddress, borg.address, owner, manager];
  const ChsbToBorgMigrator = await ethers.getContractFactory("ChsbToBorgMigrator");
  const migrator = (await upgrades.deployProxy(ChsbToBorgMigrator, migratorArgs)) as ChsbToBorgMigrator;

  console.log("Waiting for 30 seconds before verifying...");
  await new Promise(f => setTimeout(f, 30000));
  await hre.run("verify:verify", {
    address: borg.address,
    constructorArguments: [migratorAddress],
  });
  await hre.run("verify:verify", {
    address: migrator.address,
    constructorArguments: [],
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
