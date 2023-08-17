import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { ChsbToBorgMigrator, MockChsbToMigratorV2, SwissBorgToken } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract } from "ethers";
import { nextDeterministicContractAddress } from "./utils/deterministicAddress";
import { unlockAddress } from "./utils/unlockAddress";

const erc20Abi = require("./../abi/erc20.json");

describe("ChsbToBorgMigrator", function () {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let manager: SignerWithAddress;
  let swissBorgWallet: SignerWithAddress;
  let externalAccount: SignerWithAddress;

  let migrator: ChsbToBorgMigrator;
  let chsb: Contract;
  let borg: SwissBorgToken;

  const zeroAddress = "0x0000000000000000000000000000000000000000";

  before(async function () {
    [deployer, owner, manager, externalAccount] = await ethers.getSigners();
    swissBorgWallet = await unlockAddress("0x5770815B0c2a09A43C9E5AEcb7e2f3886075B605");

    chsb = await ethers.getContractAt(erc20Abi, "0xba9d4199faB4f26eFE3551D490E3821486f135Ba");

    // NOTE: The "delta = 1" is a dirty fix as hardhat-upgrades will not redeploy an existing identical implementation contract.
    // If you want to run this test alone, you need to add a delta of 2 (implementation + proxy).
    // This is because the ChsbToMigrator-Safeguard.ts test is run before, deploying the implementation.
    const migratorAddress = await nextDeterministicContractAddress(deployer, 1);

    const SwissBorgToken = await ethers.getContractFactory("SwissBorgToken", deployer);
    borg = (await SwissBorgToken.deploy(migratorAddress)) as SwissBorgToken;
  });

  describe("Deployment", function () {
    let ChsbToBorgMigrator;

    before(async function () {
      ChsbToBorgMigrator = await ethers.getContractFactory("ChsbToBorgMigrator");
    });

    it("Should not be able to deploy with address(0) for CHSB", async function () {
      const tx = upgrades.deployProxy(ChsbToBorgMigrator, [zeroAddress, borg.address, owner.address, manager.address], {
        useDeployedImplementation: false,
      }) as ChsbToBorgMigrator;
      await expect(tx).to.be.revertedWith("ADDRESS_ZERO");
    });

    it("Should not be able to deploy with address(0) for BORG", async function () {
      const tx = upgrades.deployProxy(ChsbToBorgMigrator, [
        chsb.address,
        zeroAddress,
        owner.address,
        manager.address,
      ]) as ChsbToBorgMigrator;
      await expect(tx).to.be.revertedWith("ADDRESS_ZERO");
    });

    it("Should not be able to deploy with address(0) for owner", async function () {
      const tx = upgrades.deployProxy(ChsbToBorgMigrator, [
        chsb.address,
        borg.address,
        zeroAddress,
        manager.address,
      ]) as ChsbToBorgMigrator;
      await expect(tx).to.be.revertedWith("ADDRESS_ZERO");
    });

    it("Should not be able to deploy with address(0) for manager", async function () {
      const tx = upgrades.deployProxy(ChsbToBorgMigrator, [
        chsb.address,
        borg.address,
        owner.address,
        zeroAddress,
      ]) as ChsbToBorgMigrator;
      await expect(tx).to.be.revertedWith("ADDRESS_ZERO");
    });

    it("Should be able to deploy", async function () {
      migrator = (await upgrades.deployProxy(ChsbToBorgMigrator, [
        chsb.address,
        borg.address,
        owner.address,
        manager.address,
      ])) as ChsbToBorgMigrator;
      expect(migrator.address).to.not.be.eq("0x0000000000000000000000000000000000000000");
    });

    it("Should have the right CHSB and BORG", async function () {
      expect(await migrator.CHSB()).to.be.eq(chsb.address);
      expect(await migrator.BORG()).to.be.eq(borg.address);
    });

    it("Should not be possible to call initializer", async function () {
      const tx = migrator.initialize(chsb.address, borg.address, owner.address, manager.address);
      await expect(tx).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should have transferred the ownership to the owner", async function () {
      expect(await migrator.owner()).to.be.eq(owner.address);
    });

    it("Should be on pause", async function () {
      expect(await migrator.paused()).to.be.eq(true);
    });

    it("Should not be able to migrate when on pause", async function () {
      const migrationAmount = ethers.utils.parseUnits("1", "8");

      // Approval for the test
      await chsb.connect(swissBorgWallet).approve(migrator.address, migrationAmount);

      const tx = migrator.connect(swissBorgWallet).migrate(migrationAmount);
      await expect(tx).to.be.revertedWith("Pausable: paused");
    });

    it("Should have $BORG tokens", async function () {
      const expectedBorg = ethers.utils.parseUnits("985304868442", "15"); // see BORG supply
      expect(await borg.balanceOf(migrator.address)).to.be.eq(expectedBorg);
    });
  });

  describe("Migration", function () {
    it("Should be possible to unpause", async function () {
      await migrator.connect(manager).unpause();
    });

    it("Should not be able to migrate 0 CHSB", async function () {
      const tx = migrator.connect(swissBorgWallet).migrate(0);
      await expect(tx).to.be.revertedWith("AMOUNT_ZERO");
    });

    it("Should be able to migrate 1 CHSB to 1 BORG", async function () {
      const migrationAmount = ethers.utils.parseUnits("1", "8"); // CHSB, 8 decimals
      const expectedBorgAmount = ethers.utils.parseUnits("1", "18"); // BORG, 18 decimals

      const initialWalletChsbBalance = await chsb.balanceOf(swissBorgWallet.address);
      const initialWalletBorgBalance = await borg.balanceOf(swissBorgWallet.address);
      const initialMigratorChsbBalance = await chsb.balanceOf(migrator.address);
      const initialMigratorBorgBalance = await borg.balanceOf(migrator.address);

      // Approve the contract first
      await chsb.connect(swissBorgWallet).approve(migrator.address, migrationAmount);

      // Migrate
      const tx = await migrator.connect(swissBorgWallet).migrate(migrationAmount);

      const finalWalletChsbBalance = await chsb.balanceOf(swissBorgWallet.address);
      const finalWalletBorgBalance = await borg.balanceOf(swissBorgWallet.address);
      const finalMigratorChsbBalance = await chsb.balanceOf(migrator.address);
      const finalMigratorBorgBalance = await borg.balanceOf(migrator.address);

      // 1 CHSB from wallet to migrator
      expect(initialWalletChsbBalance.sub(finalWalletChsbBalance)).to.be.eq(migrationAmount);
      expect(finalMigratorChsbBalance.sub(initialMigratorChsbBalance)).to.be.eq(migrationAmount);

      // 1 BORG from migrator to wallet
      expect(finalWalletBorgBalance.sub(initialWalletBorgBalance)).to.be.eq(expectedBorgAmount);
      expect(initialMigratorBorgBalance.sub(finalMigratorBorgBalance)).to.be.eq(expectedBorgAmount);

      // Event
      expect(tx).to.emit(migrator.address, "ChsbMigrated").withArgs([swissBorgWallet.address, migrationAmount]);
    });

    it("Should be able to migrate 100'000 CHSB to 100'000 BORG", async function () {
      const migrationAmount = ethers.utils.parseUnits("100000", "8"); // CHSB, 8 decimals
      const expectedBorgAmount = ethers.utils.parseUnits("100000", "18"); // BORG, 18 decimals

      const initialWalletChsbBalance = await chsb.balanceOf(swissBorgWallet.address);
      const initialWalletBorgBalance = await borg.balanceOf(swissBorgWallet.address);
      const initialMigratorChsbBalance = await chsb.balanceOf(migrator.address);
      const initialMigratorBorgBalance = await borg.balanceOf(migrator.address);

      // Approve the contract first
      await chsb.connect(swissBorgWallet).approve(migrator.address, migrationAmount);

      // Migrate
      await migrator.connect(swissBorgWallet).migrate(migrationAmount);

      const finalWalletChsbBalance = await chsb.balanceOf(swissBorgWallet.address);
      const finalWalletBorgBalance = await borg.balanceOf(swissBorgWallet.address);
      const finalMigratorChsbBalance = await chsb.balanceOf(migrator.address);
      const finalMigratorBorgBalance = await borg.balanceOf(migrator.address);

      // 100'000 CHSB from wallet to migrator
      expect(initialWalletChsbBalance.sub(finalWalletChsbBalance)).to.be.eq(migrationAmount);
      expect(finalMigratorChsbBalance.sub(initialMigratorChsbBalance)).to.be.eq(migrationAmount);

      // 100'000 BORG from migrator to wallet
      expect(finalWalletBorgBalance.sub(initialWalletBorgBalance)).to.be.eq(expectedBorgAmount);
      expect(initialMigratorBorgBalance.sub(finalMigratorBorgBalance)).to.be.eq(expectedBorgAmount);
    });
  });

  describe("Pause / Unpause", async function () {
    it("Should not be possible for anybody to pause", async function () {
      const tx = migrator.connect(externalAccount).pause();
      await expect(tx).to.be.revertedWith("ONLY_MANAGER");
    });

    it("Should not be possible for owner to pause", async function () {
      const tx = migrator.connect(owner).pause();
      await expect(tx).to.be.revertedWith("ONLY_MANAGER");
    });

    it("Should be possible for manager to pause", async function () {
      const initialStatus = await migrator.paused();

      await migrator.connect(manager).pause();

      const finalStatus = await migrator.paused();

      expect(initialStatus).to.be.eq(false);
      expect(finalStatus).to.be.eq(true);
    });

    it("Should not be possible for anybody to unpause", async function () {
      const tx = migrator.connect(externalAccount).unpause();
      await expect(tx).to.be.revertedWith("ONLY_MANAGER");
    });

    it("Should not be possible for owner to unpause", async function () {
      const tx = migrator.connect(owner).unpause();
      await expect(tx).to.be.revertedWith("ONLY_MANAGER");
    });

    it("Should be possible for manager to unpause", async function () {
      const initialStatus = await migrator.paused();

      await migrator.connect(manager).unpause();

      const finalStatus = await migrator.paused();

      expect(initialStatus).to.be.eq(true);
      expect(finalStatus).to.be.eq(false);
    });
  });

  describe("Set manager", async function () {
    it("Should not be possible for anybody to set a new manager", async function () {
      const tx = migrator.connect(externalAccount).setManager(externalAccount.address);
      await expect(tx).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should not be possible for owner to set address(0) as a new manager", async function () {
      const tx = migrator.connect(owner).setManager(zeroAddress);
      await expect(tx).to.be.revertedWith("ADDRESS_ZERO");
    });

    it("Should be possible for owner to set a new manager", async function () {
      const initialManager = await migrator.manager();

      const tx = await migrator.connect(owner).setManager(owner.address);

      const finalManager = await migrator.manager();

      expect(initialManager).to.be.eq(manager.address);
      expect(finalManager).to.be.eq(owner.address);
      expect(tx).to.emit(migrator.address, "SetManager").withArgs([owner.address]);
    });
  });

  describe("Upgrade", async function () {
    let newMigrator: MockChsbToMigratorV2;

    it("Should not be able to upgrade the implementation if not owner", async function () {
      const MockChsbToMigratorV2 = await ethers.getContractFactory("MockChsbToMigratorV2", externalAccount);
      const newMigrator = upgrades.upgradeProxy(migrator.address, MockChsbToMigratorV2);
      await expect(newMigrator).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should be able to upgrade the implementation", async function () {
      const previousImplementation = await migrator.getImplementation();

      const MockChsbToMigratorV2 = await ethers.getContractFactory("MockChsbToMigratorV2", owner);
      newMigrator = (await upgrades.upgradeProxy(migrator.address, MockChsbToMigratorV2)) as MockChsbToMigratorV2;

      const newImplementation = await newMigrator.getImplementation();
      const newVariable = await newMigrator.answer();

      expect(migrator.address).to.be.eq(newMigrator.address);
      expect(newImplementation).not.to.be.eq(previousImplementation);
      expect(newVariable).to.be.eq(42);
    });
  });
});
