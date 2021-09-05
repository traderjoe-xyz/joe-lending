// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;

import "./JToken.sol";
import "./PriceOracle/PriceOracle.sol";

contract UnitrollerAdminStorage {
    /**
     * @notice Administrator for this contract
     */
    address public admin;

    /**
     * @notice Pending administrator for this contract
     */
    address public pendingAdmin;

    /**
     * @notice Active brains of Unitroller
     */
    address public joetrollerImplementation;

    /**
     * @notice Pending brains of Unitroller
     */
    address public pendingJoetrollerImplementation;
}

contract JoetrollerV1Storage is UnitrollerAdminStorage {
    /**
     * @notice Oracle which gives the price of any given asset
     */
    PriceOracle public oracle;

    /**
     * @notice Multiplier used to calculate the maximum repayAmount when liquidating a borrow
     */
    uint256 public closeFactorMantissa;

    /**
     * @notice Multiplier representing the discount on collateral that a liquidator receives
     */
    uint256 public liquidationIncentiveMantissa;

    /**
     * @notice Per-account mapping of "assets you are in"
     */
    mapping(address => JToken[]) public accountAssets;

    enum Version {
        VANILLA,
        COLLATERALCAP,
        WRAPPEDNATIVE
    }

    struct Market {
        /// @notice Whether or not this market is listed
        bool isListed;
        /**
         * @notice Multiplier representing the most one can borrow against their collateral in this market.
         *  For instance, 0.9 to allow borrowing 90% of collateral value.
         *  Must be between 0 and 1, and stored as a mantissa.
         */
        uint256 collateralFactorMantissa;
        /// @notice Per-market mapping of "accounts in this asset"
        mapping(address => bool) accountMembership;
        /// @notice JToken version
        Version version;
    }

    /**
     * @notice Official mapping of jTokens -> Market metadata
     * @dev Used e.g. to determine if a market is supported
     */
    mapping(address => Market) public markets;

    /**
     * @notice The Pause Guardian can pause certain actions as a safety mechanism.
     *  Actions which allow users to remove their own assets cannot be paused.
     *  Liquidation / seizing / transfer can only be paused globally, not by market.
     */
    address public pauseGuardian;
    bool public _mintGuardianPaused;
    bool public _borrowGuardianPaused;
    bool public transferGuardianPaused;
    bool public seizeGuardianPaused;
    mapping(address => bool) public mintGuardianPaused;
    mapping(address => bool) public borrowGuardianPaused;

    struct JoeMarketState {
        /// @notice The market's last updated joeBorrowIndex or joeSupplyIndex
        uint224 index;
        /// @notice The timestamp number the index was last updated at
        uint32 timestamp;
    }

    /// @notice A list of all markets
    JToken[] public allMarkets;

    /// @notice The portion of joeRate that each market currently receives
    mapping(uint8 => mapping(address => uint256)) public joeSpeeds;

    /// @notice The JOE market supply state for each market
    mapping(uint8 => mapping(address => JoeMarketState)) public joeSupplyState;

    /// @notice The JOE market borrow state for each market
    mapping(uint8 => mapping(address => JoeMarketState)) public joeBorrowState;

    /// @notice The JOE borrow index for each market for each supplier as of the last time they accrued JOE
    mapping(uint8 => mapping(address => mapping(address => uint256))) public joeSupplierIndex;

    /// @notice The JOE borrow index for each market for each borrower as of the last time they accrued JOE
    mapping(uint8 => mapping(address => mapping(address => uint256))) public joeBorrowerIndex;

    /// @notice The JOE accrued but not yet transferred to each user
    mapping(uint8 => mapping(address => uint256)) public joeAccrued;

    // @notice The borrowCapGuardian can set borrowCaps to any number for any market. Lowering the borrow cap could disable borrowing on the given market.
    address public borrowCapGuardian;

    // @notice Borrow caps enforced by borrowAllowed for each jToken address. Defaults to zero which corresponds to unlimited borrowing.
    mapping(address => uint256) public borrowCaps;

    // @notice The supplyCapGuardian can set supplyCaps to any number for any market. Lowering the supply cap could disable supplying to the given market.
    address public supplyCapGuardian;

    // @notice Supply caps enforced by mintAllowed for each jToken address. Defaults to zero which corresponds to unlimited supplying.
    mapping(address => uint256) public supplyCaps;

    // @notice creditLimits allowed specific protocols to borrow and repay without collateral.
    mapping(address => uint256) public creditLimits;

    // @notice flashloanGuardianPaused can pause flash loan as a safety mechanism.
    mapping(address => bool) public flashloanGuardianPaused;

    /// @notice liquidityMining the liquidity mining module that handles the LM rewards distribution.
    address public liquidityMining;

    /// @notice JOE token contract address
    address public joeAddress;

}
