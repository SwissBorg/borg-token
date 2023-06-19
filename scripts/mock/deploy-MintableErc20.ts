import { ethers } from "hardhat";

async function main() {
  const MintableErc20 = await ethers.getContractFactory("MintableErc20");
  const fakeChsb = await MintableErc20.deploy();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
