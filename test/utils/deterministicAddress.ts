import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { getContractAddress } from "ethers/lib/utils";

export const nextDeterministicContractAddress = async (deployer: SignerWithAddress, delta: number): Promise<String> => {
  const transactionCount = await deployer.getTransactionCount();

  return getContractAddress({
    from: deployer.address,
    nonce: transactionCount + delta,
  });
};
