const { ethers, upgrades } = require("hardhat");

/**
 * This is a quick script to check if the upgrade is safe.
 * We put flattened versions in contracts/versions/.
 */
async function main() {
  // JCollateralCapErc20Delegate
  const JCollateralCapErc20DelegateV1 = await ethers.getContractFactory(
    "JCollateralCapErc20DelegateV1"
  );
  const jCollateralCapErc20DelegateV1 = await upgrades.deployProxy(
    JCollateralCapErc20DelegateV1,
    { initializer: false }
  );
  await jCollateralCapErc20DelegateV1.deployed();

  const JCollateralCapErc20DelegateV2 = await ethers.getContractFactory(
    "JCollateralCapErc20DelegateV2"
  );
  await upgrades.prepareUpgrade(
    jCollateralCapErc20DelegateV1.address,
    JCollateralCapErc20DelegateV2
  );

  // JWrappedNativeDelegate
  const JWrappedNativeDelegateV1 = await ethers.getContractFactory(
    "JWrappedNativeDelegateV1"
  );
  const jWrappedNativeDelegateV1 = await upgrades.deployProxy(
    JWrappedNativeDelegateV1,
    { initializer: false }
  );
  await jWrappedNativeDelegateV1.deployed();

  const JWrappedNativeDelegateV2 = await ethers.getContractFactory(
    "JWrappedNativeDelegateV2"
  );
  await upgrades.prepareUpgrade(
    jWrappedNativeDelegateV1.address,
    JWrappedNativeDelegateV2
  );
}

main();
