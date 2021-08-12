pragma solidity ^0.5.16;

import "../../contracts/ComptrollerG4.sol";

contract ComptrollerScenarioG4 is ComptrollerG4 {
    uint256 public blockNumber;

    constructor() public ComptrollerG4() {}

    function fastForward(uint256 blocks) public returns (uint256) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setBlockNumber(uint256 number) public {
        blockNumber = number;
    }

    function membershipLength(CToken cToken) public view returns (uint256) {
        return accountAssets[address(cToken)].length;
    }

    function unlist(CToken cToken) public {
        markets[address(cToken)].isListed = false;
    }
}
