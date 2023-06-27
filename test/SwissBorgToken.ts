import { expect } from "chai";
import { ethers } from "hardhat";
import { SwissBorgToken } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, Contract } from "ethers";

const erc20Abi = require("./../abi/erc20.json");

describe("SwissBorg Token", function () {
  let migrator: SignerWithAddress;
  let chsb: Contract;
  let borg: SwissBorgToken;

  const zeroAddress = "0x0000000000000000000000000000000000000000";

  before(async function () {
    [migrator] = await ethers.getSigners();
    chsb = await ethers.getContractAt(erc20Abi, "0xba9d4199faB4f26eFE3551D490E3821486f135Ba");
  });

  describe("Deployment", function () {
    let SwissBorgToken;

    before(async function () {
      SwissBorgToken = await ethers.getContractFactory("SwissBorgToken");
    });

    it("Should not be able to deploy with address(0) for migrator", async function () {
      const tx = SwissBorgToken.deploy(zeroAddress);
      await expect(tx).to.be.revertedWith("ADDRESS_ZERO");
    });

    it("Should be able to deploy", async function () {
      borg = (await SwissBorgToken.deploy(migrator.address)) as SwissBorgToken;
      expect(borg.address).to.not.be.eq("0x0000000000000000000000000000000000000000");
    });

    it("Should have the right name, symbol and decimals", async function () {
      expect(await borg.name()).to.be.eq("SwissBorg Token");
      expect(await borg.symbol()).to.be.eq("BORG");
      expect(await borg.decimals()).to.be.eq(18);
    });

    it("Should mint the right amount of tokens to migrator", async function () {
      const initialSupply = ethers.utils.parseEther("1000000000"); // CHSB: 1 billion total supply
      const burnedTokens = await chsb.balanceOf("0x0000000000000000000000000000000000000000");
      const burnedTokensScaled = burnedTokens.mul(BigNumber.from(10).pow(10)); // Scale from 8 to 18 decimals

      const expectedSupply = initialSupply.sub(burnedTokensScaled);

      expect(await borg.totalSupply()).to.be.eq(expectedSupply);
      expect(await borg.balanceOf(borg.address)).to.be.eq(0);
      expect(await borg.balanceOf(migrator.address)).to.be.eq(expectedSupply);
    });
  });

  describe("ERC20Burnable", async function () {
    it("Should be able to burn tokens", async function () {
      const initialTotalSupply = await borg.totalSupply();

      await borg.connect(migrator).burn("1");

      const finalTotalSupply = await borg.totalSupply();
      const totalSupplyDelta = finalTotalSupply.sub(initialTotalSupply);

      expect(totalSupplyDelta).to.be.eq(-1);
    });
  });
});
