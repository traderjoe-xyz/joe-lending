pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../../contracts/RewardDistributor.sol";

contract MockRewardDistributor is RewardDistributor {
    uint256 blockTimestamp;

    function updateSupplyIndex(address jToken, address[] calldata accounts) external {
        // Do nothing.
        jToken;
        accounts;
    }

    function updateBorrowIndex(address jToken, address[] calldata accounts) external {
        // Do nothing.
        jToken;
        accounts;
    }

    function harnessFastForward(uint256 secs) public returns (uint256) {
        blockTimestamp += secs;
        return blockTimestamp;
    }

    function setBlockTimestamp(uint256 number) public {
        blockTimestamp = number;
    }

    function getBlockTimestamp() public view returns (uint256) {
        return blockTimestamp;
    }
}
