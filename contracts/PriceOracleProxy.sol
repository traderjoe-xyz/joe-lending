pragma solidity ^0.5.16;

import "./CErc20.sol";
import "./CToken.sol";
import "./PriceOracle.sol";
import "./Exponential.sol";
import "./EIP20Interface.sol";

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

contract PriceOracleProxy is PriceOracle, Exponential {
    /// @notice Admin address
    address public admin;

    /// @notice cETH address
    address public cEthAddress;

    /// @notice Chainlink Aggregators
    mapping(address => AggregatorV3Interface) public aggregators;

    /// @notice Mapping of crToken to y-vault token
    mapping(address => address) public yVaults;

    /// @notice Mapping of crToken to curve swap
    mapping(address => address) public curveSwap;

    /// @notice The v1 price oracle, maintain by CREAM
    V1PriceOracleInterface public v1PriceOracle;

    address public constant cyY3CRVAddress = 0x7589C9E17BCFcE1Ccaa1f921196FDa177F0207Fc;

    /**
     * @param admin_ The address of admin to set aggregators
     */
    constructor(address admin_, address v1PriceOracle_, address cEthAddress_) public {
        admin = admin_;
        v1PriceOracle = V1PriceOracleInterface(v1PriceOracle_);
        cEthAddress = cEthAddress_;

        yVaults[cyY3CRVAddress] = 0x9cA85572E6A3EbF24dEDd195623F188735A5179f; // y-vault 3Crv
        curveSwap[cyY3CRVAddress] = 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7; // curve 3 pool
    }

    /**
     * @notice Get the underlying price of a listed cToken asset
     * @param cToken The cToken to get the underlying price of
     * @return The underlying asset price mantissa (scaled by 1e18)
     */
    function getUnderlyingPrice(CToken cToken) public view returns (uint) {
        address cTokenAddress = address(cToken);

        if (cTokenAddress == cyY3CRVAddress) {
            uint yVaultPrice = YVaultInterface(yVaults[cyY3CRVAddress]).getPricePerFullShare();
            uint virtualPrice = CurveSwapInterface(curveSwap[cyY3CRVAddress]).get_virtual_price();
            return mul_(yVaultPrice, Exp({mantissa: virtualPrice}));
        }

        AggregatorV3Interface aggregator = aggregators[cTokenAddress];
        if (address(aggregator) != address(0)) {
            uint price = getPriceFromChainlink(aggregator);

            // cETH doesn't have underlying token.
            if (cTokenAddress == cEthAddress) {
                return price;
            }

            uint underlyingDecimals = EIP20Interface(CErc20(cTokenAddress).underlying()).decimals();
            return mul_(price, 10**(18 - underlyingDecimals));
        }

        return getPriceFromV1(cTokenAddress);
    }

    function getPriceFromChainlink(AggregatorV3Interface aggregator) internal view returns (uint) {
        ( , int price, , , ) = aggregator.latestRoundData();
        require(price > 0, "invalid price");

        // Extend the decimals to 1e18.
        return mul_(uint(price), 10**(18 - uint(aggregator.decimals())));
    }

    function getPriceFromV1(address cTokenAddress) internal view returns (uint) {
        address underlying = CErc20(cTokenAddress).underlying();
        return v1PriceOracle.assetPrices(underlying);
    }

    event AggregatorUpdated(address cTokenAddress, address source);

    function _setAdmin(address _admin) external {
        require(msg.sender == admin, "!admin");
        admin = _admin;
    }

    function _setAggregators(address[] calldata cTokenAddresses, address[] calldata sources) external {
        require(msg.sender == admin, "only the admin may set the aggregators");
        for (uint i = 0; i < cTokenAddresses.length; i++) {
            aggregators[cTokenAddresses[i]] = AggregatorV3Interface(sources[i]);
            emit AggregatorUpdated(cTokenAddresses[i], sources[i]);
        }
    }
}
