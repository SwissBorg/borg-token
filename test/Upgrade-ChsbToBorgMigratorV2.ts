import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { ChsbToBorgMigrator, ChsbToBorgMigratorV2 } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { unlockAddress } from "./utils/unlockAddress";
import { Contract } from "ethers";

const erc20Abi = require("./../abi/erc20.json");
const migratorAbi = require("./../abi/migrator.json");

describe("ChsbToBorgMigrator-Close", function () {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let manager: SignerWithAddress;
  let swissBorgWallet: SignerWithAddress;
  let externalAccount: SignerWithAddress;

  let migrator: ChsbToBorgMigrator;
  let migratorV2: ChsbToBorgMigratorV2;
  let chsb: Contract;
  let borg: Contract;

  const zeroAddress = "0x0000000000000000000000000000000000000000";

  before(async function () {
    [deployer, externalAccount] = await ethers.getSigners();
    swissBorgWallet = await unlockAddress("0x6D608425941a40Cc74D5c5ae4aD75A7b7B21f9aa");
    manager = await unlockAddress("0x259c444b50e3Ab173c4f850BB40d85A9EA0230F3");
    owner = await unlockAddress("0xAC15982Ca8A8e8BAc738FE492b84D8761B4384a3");

    // Fund owner & manager
    await swissBorgWallet.sendTransaction({
      to: owner.address,
      value: ethers.utils.parseEther("0.05"),
    });

    await swissBorgWallet.sendTransaction({
      to: manager.address,
      value: ethers.utils.parseEther("0.05"),
    });

    migrator = (await ethers.getContractAt(
      migratorAbi,
      "0xaA854688caAB725fe17b7D21b46fDA5AF365985a",
    )) as ChsbToBorgMigrator;
    chsb = await ethers.getContractAt(erc20Abi, "0xba9d4199faB4f26eFE3551D490E3821486f135Ba");
    borg = await ethers.getContractAt(erc20Abi, "0x64d0f55Cd8C7133a9D7102b13987235F486F2224");
  });

  describe("Upgrade & Close", function () {
    it("Should be able to pause the migrator", async function () {
      await migrator.connect(manager).pause();
      expect(await migrator.paused()).to.be.eq(true);
    });

    it("Should not be able to upgrade the implementation if not owner", async function () {
      const ChsbToBorgMigratorV2 = await ethers.getContractFactory("ChsbToBorgMigratorV2", externalAccount);
      const migratorImplV2 = (await ChsbToBorgMigratorV2.deploy()) as ChsbToBorgMigratorV2;

      const tx = migrator.upgradeTo(migratorImplV2.address);
      await expect(tx).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should be able to upgrade the implementation", async function () {
      const ChsbToBorgMigratorV2 = await ethers.getContractFactory("ChsbToBorgMigratorV2", externalAccount);
      const migratorImplV2 = (await ChsbToBorgMigratorV2.deploy()) as ChsbToBorgMigratorV2;

      const previousImplementation = await migrator.getImplementation();

      await migrator.connect(owner).upgradeTo(migratorImplV2.address);
      migratorV2 = (await ethers.getContractAt("ChsbToBorgMigratorV2", migrator.address)) as ChsbToBorgMigratorV2;

      const newImplementation = await migrator.getImplementation();

      expect(newImplementation).not.to.be.eq(previousImplementation);
    });

    it("Should not be able to burn CHSB if not owner", async function () {
      const tx = migratorV2.connect(externalAccount).burnChsb();
      await expect(tx).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should be able to burn the CHSB", async function () {
      const initialMigratorChsbBalance = await chsb.balanceOf(migratorV2.address);
      const initialAddressZeroBalance = await chsb.balanceOf(zeroAddress);

      await migratorV2.connect(owner).burnChsb();

      const finalMigratorChsbBalance = await chsb.balanceOf(migratorV2.address);
      const finalAddressZeroBalance = await chsb.balanceOf(zeroAddress);

      expect(initialMigratorChsbBalance).to.be.gte(0);
      expect(finalMigratorChsbBalance).to.be.eq(0);
      expect(finalAddressZeroBalance).to.be.eq(initialAddressZeroBalance.add(initialMigratorChsbBalance));
    });

    it("Should not be able to withdraw BORG if not owner", async function () {
      const tx = migratorV2.connect(externalAccount).withdrawBorg(owner.address, 1);
      await expect(tx).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should be able to withdraw part of the BORG", async function () {
      const initialMigratorBorgBalance = await borg.balanceOf(migratorV2.address);
      const initialOwnerBalance = await borg.balanceOf(owner.address);

      await migratorV2.connect(owner).withdrawBorg(owner.address, 1);

      const finalMigratorBorgBalance = await borg.balanceOf(migratorV2.address);
      const finalOwnerBalance = await borg.balanceOf(owner.address);

      expect(initialMigratorBorgBalance).to.be.gte(0);
      expect(finalMigratorBorgBalance).to.be.eq(initialMigratorBorgBalance.sub(1));
      expect(finalOwnerBalance).to.be.eq(initialOwnerBalance.add(1));
    });

    it("Should be able to withdraw all the BORG", async function () {
      const initialMigratorBorgBalance = await borg.balanceOf(migratorV2.address);
      const initialOwnerBalance = await borg.balanceOf(owner.address);

      await migratorV2.connect(owner).withdrawBorg(owner.address, initialMigratorBorgBalance);

      const finalMigratorBorgBalance = await borg.balanceOf(migratorV2.address);
      const finalOwnerBalance = await borg.balanceOf(owner.address);

      expect(initialMigratorBorgBalance).to.be.gte(0);
      expect(finalMigratorBorgBalance).to.be.eq(0);
      expect(finalOwnerBalance).to.be.eq(initialOwnerBalance.add(initialMigratorBorgBalance));
    });

    it("Should not be able to migrate anymore", async function () {
      const tx = migratorV2.connect(swissBorgWallet).migrate(1);
      await expect(tx).to.be.revertedWith("Pausable: paused");
    });

    it("Should not be able to migrate anymore even if not paused", async function () {
      await migratorV2.connect(manager).unpause();

      const tx = migratorV2.connect(swissBorgWallet).migrate(1);
      await expect(tx).to.be.revertedWith("MIGRATION_CLOSED");
    });
  });
});
