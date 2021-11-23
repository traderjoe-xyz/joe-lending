const { ethers, upgrades } = require("hardhat");

// This the old implementation artifact
const DELEGATE_ARTIFACT = require("../deployments/rinkeby/JUsdcDelegate.json");

async function main() {
  // Deploying
  const v1 = await ethers.getContractFactory(
    DELEGATE_ARTIFACT.abi,
    DELEGATE_ARTIFACT.bytecode
  );
  const instance = await upgrades.deployProxy(v1, { initializer: false });
  await instance.deployed();

  // Upgrading
  const v2 = await ethers.getContractFactory("JCollateralCapErc20Delegate");
  const upgraded = await upgrades.upgradeProxy(instance.address, v2);
}

// main();
