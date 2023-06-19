import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { ChsbToBorgMigrator, SwissBorgToken, MintableErc20 } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { nextDeterministicContractAddress } from "./utils/deterministicAddress";
import { unlockAddress } from "./utils/unlockAddress";

const erc20Abi = require("./../abi/erc20.json");

describe("ChsbToBorgMigrator-Safeguard", function () {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let manager: SignerWithAddress;
  let swissBorgWallet: SignerWithAddress;
  let externalAccount: SignerWithAddress;

  let migrator: ChsbToBorgMigrator;
  let fakeChsb: MintableErc20;
  let borg: SwissBorgToken;

  const zeroAddress = "0x0000000000000000000000000000000000000000";
  const oneAddress = "0x0000000000000000000000000000000000000001";

  before(async function () {
    [deployer, owner, manager, externalAccount] = await ethers.getSigners();
    swissBorgWallet = await unlockAddress("0x5770815B0c2a09A43C9E5AEcb7e2f3886075B605");

    const MintableErc20 = await ethers.getContractFactory("MintableErc20");
    fakeChsb = (await MintableErc20.deploy()) as MintableErc20;

    const migratorAddress = await nextDeterministicContractAddress(deployer, 2);

    const SwissBorgToken = await ethers.getContractFactory("SwissBorgToken", deployer);
    borg = (await SwissBorgToken.deploy(migratorAddress)) as SwissBorgToken;
  });

  describe("Deployment", function () {
    let ChsbToBorgMigrator;

    before(async function () {
      ChsbToBorgMigrator = await ethers.getContractFactory("ChsbToBorgMigrator");
    });

    it("Should be able to deploy", async function () {
      migrator = (await upgrades.deployProxy(
        ChsbToBorgMigrator,
        [fakeChsb.address, borg.address, owner.address, manager.address],
        { useDeployedImplementation: false },
      )) as ChsbToBorgMigrator;
      expect(migrator.address).to.not.be.eq(zeroAddress);
    });

    it("Should have the right CHSB and BORG", async function () {
      expect(await migrator.CHSB()).to.be.eq(fakeChsb.address);
      expect(await migrator.BORG()).to.be.eq(borg.address);
    });

    it("Should be on pause", async function () {
      expect(await migrator.paused()).to.be.eq(true);
    });

    after(async function () {
      // Unpause the contract to start the migration process
      await migrator.connect(manager).unpause();
    });
  });

  describe("Safeguard", function () {
    const migrationAmount = ethers.utils.parseUnits("1", "8");
    const initialSupply = ethers.utils.parseUnits("1000000000", "8");

    it("Should not be possible to migrate if the CHSB supply was changed", async function () {
      // Mint 1 billion + 1 extra CHSB, making the supply > 1 billion
      await fakeChsb.connect(swissBorgWallet).mint(initialSupply);
      await fakeChsb.connect(swissBorgWallet).mint(migrationAmount);
      expect(await fakeChsb.totalSupply()).to.be.eq(initialSupply.add(migrationAmount));

      // Approve contract
      await fakeChsb.connect(swissBorgWallet).approve(migrator.address, migrationAmount);

      // Migrate
      const tx = migrator.connect(swissBorgWallet).migrate(migrationAmount);
      await expect(tx).to.be.revertedWith("CHSB_SUPPLY_WRONG");
    });

    after(async function () {
      // Reset supply to 1 billion
      await fakeChsb.connect(swissBorgWallet).burn(migrationAmount);
      // Send the CHSB to address(0)
      const burnedChsb = ethers.utils.parseUnits("14316585358", "5"); // 14'316'585.358 CHSB with (8 - 3 = 5) decimals
      await fakeChsb.connect(swissBorgWallet).transfer(oneAddress, burnedChsb);
    });
  });

  describe("Migrate all", function () {
    it("Should be possible to migrate all the CHSB that exists", async function () {
      // The migration amount must take into account the CHSB burnt.
      const migrationAmount = ethers.utils.parseUnits("985683414642", "5"); // CHSB, 8 decimals, 985'683'414.642 CHSB with (8 - 3 = 5) decimals
      const expectedBorgAmount = ethers.utils.parseUnits("985683414642", "15"); // BORG, 18 decimals, 985'683'414.642 CHSB with (18 - 3 = 5) decimals

      const initialWalletChsbBalance = await fakeChsb.balanceOf(swissBorgWallet.address);
      const initialWalletBorgBalance = await borg.balanceOf(swissBorgWallet.address);
      const initialMigratorChsbBalance = await fakeChsb.balanceOf(migrator.address);
      const initialMigratorBorgBalance = await borg.balanceOf(migrator.address);

      // Approve the contract first
      await fakeChsb.connect(swissBorgWallet).approve(migrator.address, migrationAmount);

      // Migrate
      await migrator.connect(swissBorgWallet).migrate(migrationAmount);

      const finalWalletChsbBalance = await fakeChsb.balanceOf(swissBorgWallet.address);
      const finalWalletBorgBalance = await borg.balanceOf(swissBorgWallet.address);
      const finalMigratorChsbBalance = await fakeChsb.balanceOf(migrator.address);
      const finalMigratorBorgBalance = await borg.balanceOf(migrator.address);

      expect(initialWalletChsbBalance).to.be.eq(migrationAmount);
      expect(finalWalletChsbBalance).to.be.eq(0);
      expect(initialWalletBorgBalance).to.be.eq(0);
      expect(finalWalletBorgBalance).to.be.eq(expectedBorgAmount);

      expect(initialMigratorChsbBalance).to.be.eq(0);
      expect(finalMigratorChsbBalance).to.be.eq(migrationAmount);
      expect(initialMigratorBorgBalance).to.be.eq(expectedBorgAmount);
      expect(finalMigratorBorgBalance).to.be.eq(0);
    });
  });
});
