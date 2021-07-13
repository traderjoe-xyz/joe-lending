pragma solidity ^0.5.16;

import "../../contracts/LiquidityMiningInterface.sol";

contract MockLiquidityMining is LiquidityMiningInterface {
    address public comptroller;

    constructor(address _comptroller) public {
        comptroller = _comptroller;
    }

    function updateSupplyIndex(address cToken, address[] calldata accounts) external {
        // Do nothing.
        cToken;
        accounts;
    }

    function updateBorrowIndex(address cToken, address[] calldata accounts) external {
        // Do nothing.
        cToken;
        accounts;
    }
}
