// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;

import "../JErc20.sol";
import "../JToken.sol";
import "./PriceOracle.sol";
import "../Exponential.sol";
import "../EIP20Interface.sol";

interface V1PriceOracleInterface {
    function assetPrices(address asset) external view returns (uint);
}

interface CurveSwapInterface {
    function get_virtual_price() external view returns (uint256);
}

interface YVaultInterface {
    function getPricePerFullShare() external view returns (uint256);
}

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);

    // getRoundData and latestRoundData should both raise "No data present"
    // if they do not have data to report, instead of returning unset values
    // which could be misinterpreted as actual reported values.
    function getRoundData(uint80 _roundId) external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );

    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

contract PriceOracleProxyUSD is PriceOracle, Exponential {
    /// @notice ChainLink aggregator base, currently support USD and ETH
    enum AggregatorBase {
        USD,
        ETH
    }

    /// @notice Admin address
    address public admin;

    /// @notice Guardian address
    address public guardian;

    struct AggregatorInfo {
        /// @notice The source address of the aggregator
        AggregatorV3Interface source;

        /// @notice The aggregator base
        AggregatorBase base;
    }

    /// @notice Chainlink Aggregators
    mapping(address => AggregatorInfo) public aggregators;

    /// @notice Mapping of crToken to y-vault token
    mapping(address => address) public yVaults;

    /// @notice Mapping of crToken to curve swap
    mapping(address => address) public curveSwap;

    /// @notice The v1 price oracle, maintain by CREAM
    V1PriceOracleInterface public v1PriceOracle;

    AggregatorV3Interface public ethUsdAggregator;

    /**
     * @param admin_ The address of admin to set aggregators
     * @param v1PriceOracle_ The v1 price oracle
     */
    constructor(address admin_, address v1PriceOracle_, address ethUsdAggregator_) public {
        admin = admin_;
        v1PriceOracle = V1PriceOracleInterface(v1PriceOracle_);
        ethUsdAggregator = AggregatorV3Interface(ethUsdAggregator_);
    }

    /**
     * @notice Get the underlying price of a listed jToken asset
     * @param jToken The jToken to get the underlying price of
     * @return The underlying asset price mantissa (scaled by 1e18)
     */
    function getUnderlyingPrice(JToken jToken) public view returns (uint) {
        address jTokenAddress = address(jToken);

        AggregatorInfo memory aggregatorInfo = aggregators[jTokenAddress];
        if (address(aggregatorInfo.source) != address(0)) {
            uint price = getPriceFromChainlink(aggregatorInfo.source);
            if (aggregatorInfo.base == AggregatorBase.ETH) {
                // Convert the price to USD based if it's ETH based.
                price = mul_(price, Exp({mantissa: getPriceFromChainlink(ethUsdAggregator)}));
            }
            uint underlyingDecimals = EIP20Interface(JErc20(jTokenAddress).underlying()).decimals();
            return mul_(price, 10**(18 - underlyingDecimals));
        }

        return getPriceFromV1(jTokenAddress);
    }

    /*** Internal fucntions ***/

    /**
     * @notice Get price from ChainLink
     * @param aggregator The ChainLink aggregator to get the price of
     * @return The price
     */
    function getPriceFromChainlink(AggregatorV3Interface aggregator) internal view returns (uint) {
        ( , int price, , , ) = aggregator.latestRoundData();
        require(price > 0, "invalid price");

        // Extend the decimals to 1e18.
        return mul_(uint(price), 10**(18 - uint(aggregator.decimals())));
    }

    /**
     * @notice Get price from v1 price oracle
     * @param jTokenAddress The JToken address
     * @return The price
     */
    function getPriceFromV1(address jTokenAddress) internal view returns (uint) {
        address underlying = JErc20(jTokenAddress).underlying();
        return v1PriceOracle.assetPrices(underlying);
    }

    /*** Admin or guardian functions ***/

    event AggregatorUpdated(address jTokenAddress, address source, AggregatorBase base);
    event SetGuardian(address guardian);
    event SetAdmin(address admin);

    /**
     * @notice Set guardian for price oracle proxy
     * @param _guardian The new guardian
     */
    function _setGuardian(address _guardian) external {
        require(msg.sender == admin, "only the admin may set new guardian");
        guardian = _guardian;
        emit SetGuardian(guardian);
    }

    /**
     * @notice Set admin for price oracle proxy
     * @param _admin The new admin
     */
    function _setAdmin(address _admin) external {
        require(msg.sender == admin, "only the admin may set new admin");
        admin = _admin;
        emit SetAdmin(admin);
    }

    /**
     * @notice Set ChainLink aggregators for multiple jTokens
     * @param jTokenAddresses The list of jTokens
     * @param sources The list of ChainLink aggregator sources
     * @param bases The list of ChainLink aggregator bases
     */
    function _setAggregators(address[] calldata jTokenAddresses, address[] calldata sources, AggregatorBase[] calldata bases) external {
        require(msg.sender == admin || msg.sender == guardian, "only the admin or guardian may set the aggregators");
        require(jTokenAddresses.length == sources.length && jTokenAddresses.length == bases.length, "mismatched data");
        for (uint i = 0; i < jTokenAddresses.length; i++) {
            if (sources[i] != address(0)) {
                require(msg.sender == admin, "guardian may only clear the aggregator");
            }
            aggregators[jTokenAddresses[i]] = AggregatorInfo({source: AggregatorV3Interface(sources[i]), base: bases[i]});
            emit AggregatorUpdated(jTokenAddresses[i], sources[i], bases[i]);
        }
    }
}
