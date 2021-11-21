pragma solidity ^0.5.16;

import "../../contracts/LiquidityMiningInterface.sol";

contract MockLiquidityMining is LiquidityMiningInterface {
    address public joetroller;

    constructor(address _joetroller) public {
        joetroller = _joetroller;
    }

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
}
