// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./JErc20.sol";
import "./JToken.sol";
import "./PriceOracle/PriceOracle.sol";
import "./Exponential.sol";
import "./EIP20Interface.sol";

interface V1PriceOracleInterface {
    function assetPrices(address asset) external view returns (uint256);
}

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

interface IStdReference {
    /// A structure returned whenever someone requests for standard reference data.
    struct ReferenceData {
        uint256 rate; // base/quote exchange rate, multiplied by 1e18.
        uint256 lastUpdatedBase; // UNIX epoch of the last time when base price gets updated.
        uint256 lastUpdatedQuote; // UNIX epoch of the last time when quote price gets updated.
    }

    /// Returns the price data for the given base/quote pair. Revert if not available.
    function getReferenceData(string calldata _base, string calldata _quote)
        external
        view
        returns (ReferenceData memory);

    /// Similar to getReferenceData, but with multiple base/quote pairs at once.
    function getRefenceDataBulk(string[] calldata _bases, string[] calldata _quotes)
        external
        view
        returns (ReferenceData[] memory);
}

contract PriceOracleProxyFTM is PriceOracle, Exponential {
    /// @notice Admin address
    address public admin;

    /// @notice BAND reference
    IStdReference public ref;

    /// @notice Chainlink Aggregators
    mapping(address => AggregatorV3Interface) public aggregators;

    /// @notice The v1 price oracle, maintain by CREAM
    V1PriceOracleInterface public v1PriceOracle;

    /// @notice The mapping records the crToken and its underlying symbol that we use for BAND reference
    ///         It's not necessarily equals to the symbol in the underlying contract
    mapping(address => string) public underlyingSymbols;

    /// @notice The max price diff that we could tolerant
    uint256 public maxPriceDiff = 0.1e18;

    /// @notice Quote symbol we used for BAND reference contract
    string public constant QUOTE_SYMBOL = "USD";

    /**
     * @param admin_ The address of admin to set aggregators
     * @param v1PriceOracle_ The address of the v1 price oracle, which will continue to operate and hold prices for collateral assets
     * @param reference_ The price reference contract, which will be served for one of our primary price source on Fantom
     */
    constructor(
        address admin_,
        address v1PriceOracle_,
        address reference_
    ) public {
        admin = admin_;
        v1PriceOracle = V1PriceOracleInterface(v1PriceOracle_);
        ref = IStdReference(reference_);
    }

    /**
     * @notice Get the underlying price of a listed jToken asset
     * @param jToken The jToken to get the underlying price of
     * @return The underlying asset price mantissa (scaled by 1e18)
     */
    function getUnderlyingPrice(JToken jToken) public view returns (uint256) {
        address jTokenAddress = address(jToken);

        uint256 chainLinkPrice = getPriceFromChainlink(jTokenAddress);
        uint256 bandPrice = getPriceFromBAND(jTokenAddress);
        if (chainLinkPrice != 0 && bandPrice != 0) {
            checkPriceDiff(chainLinkPrice, bandPrice);

            // Return the average of two prices.
            return div_(add_(chainLinkPrice, bandPrice), 2);
        }
        if (chainLinkPrice != 0) {
            return chainLinkPrice;
        }
        if (bandPrice != 0) {
            return bandPrice;
        }

        return getPriceFromV1(jTokenAddress);
    }

    /*** Internal fucntions ***/

    /**
     * @notice Check the max diff between two prices.
     * @param price1 Price 1
     * @param price1 Price 2
     */
    function checkPriceDiff(uint256 price1, uint256 price2) internal view {
        uint256 min = price1 < price2 ? price1 : price2;
        uint256 max = price1 < price2 ? price2 : price1;

        // priceCap = min * (1 + maxPriceDiff)
        uint256 onePlusMaxDiffMantissa = add_(1e18, maxPriceDiff);
        uint256 priceCap = mul_(min, Exp({mantissa: onePlusMaxDiffMantissa}));
        require(priceCap > max, "too much diff between price feeds");
    }

    /**
     * @notice Try to get the underlying price of a jToken from Chain Link.
     * @param jTokenAddress The token to get the underlying price of
     * @return The price. Return 0 if the aggregator is not set.
     */
    function getPriceFromChainlink(address jTokenAddress) internal view returns (uint256) {
        AggregatorV3Interface aggregator = aggregators[jTokenAddress];
        if (address(aggregator) != address(0)) {
            (, int256 answer, , , ) = aggregator.latestRoundData();

            // It's fine for price to be 0. We have two price feeds.
            if (answer == 0) {
                return 0;
            }

            // Extend the decimals to 1e18.
            uint256 price = mul_(uint256(answer), 10**(18 - uint256(aggregator.decimals())));
            return getNormalizedPrice(price, jTokenAddress);
        }
        return 0;
    }

    /**
     * @notice Try to get the underlying price of a jToken from BAND protocol.
     * @param jTokenAddress The token to get the underlying price of
     * @return The price. Return 0 if the undelrying sumbol is not set.
     */
    function getPriceFromBAND(address jTokenAddress) internal view returns (uint256) {
        bytes memory symbol = bytes(underlyingSymbols[jTokenAddress]);
        if (symbol.length != 0) {
            IStdReference.ReferenceData memory data = ref.getReferenceData(string(symbol), QUOTE_SYMBOL);
            // Price from BAND is always 1e18 base.
            return getNormalizedPrice(data.rate, jTokenAddress);
        }
        return 0;
    }

    /**
     * @notice Normalize the price according to the underlying decimals.
     * @param price The original price
     * @param jTokenAddress The jToken address
     * @return The normalized price.
     */
    function getNormalizedPrice(uint256 price, address jTokenAddress) internal view returns (uint256) {
        uint256 underlyingDecimals = EIP20Interface(JErc20(jTokenAddress).underlying()).decimals();
        return mul_(price, 10**(18 - underlyingDecimals));
    }

    /**
     * @notice Get price from v1 price oracle
     * @param jTokenAddress The token to get the underlying price of
     * @return The underlying price.
     */
    function getPriceFromV1(address jTokenAddress) internal view returns (uint256) {
        address underlying = JErc20(jTokenAddress).underlying();
        return v1PriceOracle.assetPrices(underlying);
    }

    /*** Admin fucntions ***/

    event AdminUpdated(address admin);
    event MaxPriceDiffUpdated(uint256 maxDiff);
    event AggregatorUpdated(address jTokenAddress, address source);
    event UnderlyingSymbolUpdated(address jTokenAddress, string symbol);

    function _setAdmin(address _admin) external {
        require(msg.sender == admin, "only the admin may set the new admin");
        admin = _admin;
        emit AdminUpdated(_admin);
    }

    function _setMaxPriceDiff(uint256 _maxPriceDiff) external {
        require(msg.sender == admin, "only the admin may set the max price diff");
        maxPriceDiff = _maxPriceDiff;
        emit MaxPriceDiffUpdated(_maxPriceDiff);
    }

    function _setAggregators(address[] calldata jTokenAddresses, address[] calldata sources) external {
        require(msg.sender == admin, "only the admin may set the aggregators");
        for (uint256 i = 0; i < jTokenAddresses.length; i++) {
            aggregators[jTokenAddresses[i]] = AggregatorV3Interface(sources[i]);
            emit AggregatorUpdated(jTokenAddresses[i], sources[i]);
        }
    }

    function _setUnderlyingSymbols(address[] calldata jTokenAddresses, string[] calldata symbols) external {
        require(msg.sender == admin, "only the admin may set the undelrying symbols");
        for (uint256 i = 0; i < jTokenAddresses.length; i++) {
            underlyingSymbols[jTokenAddresses[i]] = symbols[i];
            emit UnderlyingSymbolUpdated(jTokenAddresses[i], symbols[i]);
        }
    }
}
