// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @notice This is a helper for fetching and maintaing supply/borrow rewards for lending markets.
 */
contract RewardLens is Ownable {
    mapping(address => uint256) public supplyRewardsJoePerSec;
    mapping(address => uint256) public borrowRewardsJoePerSec;
    mapping(address => uint256) public supplyRewardsAvaxPerSec;
    mapping(address => uint256) public borrowRewardsAvaxPerSec;

    function setSupplyRewardsJoePerSec(address market, uint256 amount) external onlyOwner {
        supplyRewardsJoePerSec[market] = amount;
    }

    function setBorrowsRewardsJoePerSec(address market, uint256 amount) external onlyOwner {
        borrowRewardsJoePerSec[market] = amount;
    }

    function setSupplyRewardsAvaxPerSec(address market, uint256 amount) external onlyOwner {
        supplyRewardsAvaxPerSec[market] = amount;
    }

    function setBorrowsRewardsAvaxPerSec(address market, uint256 amount) external onlyOwner {
        borrowRewardsAvaxPerSec[market] = amount;
    }
}
