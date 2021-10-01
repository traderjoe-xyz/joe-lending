// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;

import "../JErc20.sol";
import "../JToken.sol";
import "./PriceOracle.sol";
import "../Exponential.sol";
import "../EIP20Interface.sol";

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function description() external view returns (string memory);

    function version() external view returns (uint256);

    // getRoundData and latestRoundData should both raise "No data present"
    // if they do not have data to report, instead of returning unset values
    // which could be misinterpreted as actual reported values.
    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

contract PriceOracleProxyUSD is PriceOracle, Exponential {
    /// @notice Fallback price feed - not used
    mapping(address => uint256) internal prices;

    /// @notice Admin address
    address public admin;

    /// @notice Guardian address
    address public guardian;

    /// @notice Chainlink Aggregators
    mapping(address => AggregatorV3Interface) public aggregators;

    /**
     * @param admin_ The address of admin to set aggregators
     */
    constructor(address admin_) public {
        admin = admin_;
    }

    /**
     * @notice Get the underlying price of a listed jToken asset
     * @param jToken The jToken to get the underlying price of
     * @return The underlying asset price mantissa (scaled by 1e18)
     */
    function getUnderlyingPrice(JToken jToken) public view returns (uint256) {
        address jTokenAddress = address(jToken);

        AggregatorV3Interface aggregator = aggregators[jTokenAddress];
        if (address(aggregator) != address(0)) {
            uint256 price = getPriceFromChainlink(aggregator);
            uint256 underlyingDecimals = EIP20Interface(JErc20(jTokenAddress).underlying()).decimals();
            if (underlyingDecimals <= 18) {
                return mul_(price, 10**(18 - underlyingDecimals));
            }
            return div_(price, 10**(underlyingDecimals - 18));
        }

        address asset = address(JErc20(jTokenAddress).underlying());

        uint256 price = prices[asset];
        require(price > 0, "invalid price");
        return price;
    }

    /*** Internal fucntions ***/

    /**
     * @notice Get price from ChainLink
     * @param aggregator The ChainLink aggregator to get the price of
     * @return The price
     */
    function getPriceFromChainlink(AggregatorV3Interface aggregator) internal view returns (uint256) {
        (, int256 price, , , ) = aggregator.latestRoundData();
        require(price > 0, "invalid price");

        // Extend the decimals to 1e18.
        return mul_(uint256(price), 10**(18 - uint256(aggregator.decimals())));
    }

    /*** Admin or guardian functions ***/

    event AggregatorUpdated(address jTokenAddress, address source);
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
     */
    function _setAggregators(address[] calldata jTokenAddresses, address[] calldata sources) external {
        require(msg.sender == admin || msg.sender == guardian, "only the admin or guardian may set the aggregators");
        require(jTokenAddresses.length == sources.length, "mismatched data");
        for (uint256 i = 0; i < jTokenAddresses.length; i++) {
            if (sources[i] != address(0)) {
                require(msg.sender == admin, "guardian may only clear the aggregator");
            }
            aggregators[jTokenAddresses[i]] = AggregatorV3Interface(sources[i]);
            emit AggregatorUpdated(jTokenAddresses[i], sources[i]);
        }
    }

    /**
     * @notice Set the price of underlying asset
     * @param jToken The jToken to get underlying asset from
     * @param underlyingPriceMantissa The new price for the underling asset
     */
    function _setUnderlyingPrice(JToken jToken, uint256 underlyingPriceMantissa) external {
        require(msg.sender == admin, "only the admin may set the underlying price");
        address asset = address(JErc20(address(jToken)).underlying());
        prices[asset] = underlyingPriceMantissa;
    }

    /**
     * @notice Set the price of the underlying asset directly
     * @param asset The address of the underlying asset
     * @param price The new price of the asset
     */
    function setDirectPrice(address asset, uint256 price) external {
        require(msg.sender == admin, "only the admin may set the direct price");
        prices[asset] = price;
    }
}
