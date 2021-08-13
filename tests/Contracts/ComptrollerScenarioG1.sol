pragma solidity ^0.5.16;

import "../../contracts/ComptrollerG1.sol";
import "../../contracts/PriceOracle.sol";

// XXX we should delete G1 everything...
//  requires fork/deploy bytecode tests

contract ComptrollerScenarioG1 is ComptrollerG1 {
    uint256 public blockNumber;

    constructor() public ComptrollerG1() {}

    function membershipLength(CToken cToken) public view returns (uint256) {
        return accountAssets[address(cToken)].length;
    }

    function fastForward(uint256 blocks) public returns (uint256) {
        blockNumber += blocks;

        return blockNumber;
    }

    function setBlockNumber(uint256 number) public {
        blockNumber = number;
    }

    function _become(
        Unitroller unitroller,
        PriceOracle _oracle,
        uint256 _closeFactorMantissa,
        uint256 _maxAssets,
        bool reinitializing
    ) public {
        super._become(unitroller, _oracle, _closeFactorMantissa, _maxAssets, reinitializing);
    }

    function getHypotheticalAccountLiquidity(
        address account,
        address cTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount
    )
        public
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        (Error err, uint256 liquidity, uint256 shortfall) = super.getHypotheticalAccountLiquidityInternal(
            account,
            CToken(cTokenModify),
            redeemTokens,
            borrowAmount
        );
        return (uint256(err), liquidity, shortfall);
    }

    function unlist(CToken cToken) public {
        markets[address(cToken)].isListed = false;
    }
}
