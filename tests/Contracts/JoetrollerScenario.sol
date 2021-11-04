pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../../contracts/Joetroller.sol";

contract JoetrollerScenario is Joetroller {
    uint256 public blockTimestamp;

    constructor() public Joetroller() {}

    function fastForward(uint256 secs) public returns (uint256) {
        blockTimestamp += secs;
        return blockTimestamp;
    }

    function setBlockTimestamp(uint256 number) public {
        blockTimestamp = number;
    }

    function getBlockTimestamp() public view returns (uint256) {
        return blockTimestamp;
    }

    function membershipLength(JToken jToken) public view returns (uint256) {
        return accountAssets[address(jToken)].length;
    }

    function unlist(JToken jToken) public {
        markets[address(jToken)].isListed = false;
    }
}
