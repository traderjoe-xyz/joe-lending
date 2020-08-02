pragma solidity ^0.5.16;

import "./CErc20.sol";
import "./CToken.sol";
import "./PriceOracle.sol";
import "./Exponential.sol";

interface V1PriceOracleInterface {
    function assetPrices(address asset) external view returns (uint);
}

interface AggregatorInterface {
  function latestAnswer() external view returns (int256);
  function latestTimestamp() external view returns (uint256);
  function latestRound() external view returns (uint256);
  function getAnswer(uint256 roundId) external view returns (int256);
  function getTimestamp(uint256 roundId) external view returns (uint256);

  event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 timestamp);
  event NewRound(uint256 indexed roundId, address indexed startedBy);
}

contract PriceOracleProxy is PriceOracle, Exponential {
    uint constant usdScale = 1e12;

    /// @notice Indicator that this is a PriceOracle contract (for inspection)
    bool public constant isPriceOracle = true;

    /// @notice The v1 price oracle, which will continue to serve prices for v1 assets
    V1PriceOracleInterface public v1PriceOracle;

    /// @notice Address of the cEther contract, which has a constant price
    address public cEthAddress;

    /// @notice Address of the cUSDC contract, which uses Chainlink's price
    address public cUsdcAddress;

    /// @notice Address of the cUSDT contract, which uses the Chainlink's price
    address public cUsdtAddress;

    address public usdcAggregator;
    address public usdtAggregator;

    /**
     * @param v1PriceOracle_ The address of the v1 price oracle, which will continue to operate and hold prices for collateral assets
     * @param cEthAddress_ The address of cETH, which will return a constant 1e18, since all prices relative to ether
     * @param cUsdtAddress_ The address of cUSDC
     * @param cUsdtAddress_ The address of cUSDT
     * @param usdcAggregator_ The address of USDC/ETH Aggregator
     * @param usdtAggregator_ The address of USDT/ETH Aggregator
     */
    constructor(address v1PriceOracle_,
                address cEthAddress_,
                address cUsdcAddress_,
                address cUsdtAddress_,
                address usdcAggregator_,
                address usdtAggregator_) public {

        v1PriceOracle = V1PriceOracleInterface(v1PriceOracle_);
        cEthAddress = cEthAddress_;
        cUsdcAddress = cUsdcAddress_;
        cUsdtAddress = cUsdtAddress_;
        usdcAggregator = usdcAggregator_;
        usdtAggregator = usdtAggregator_;
    }

    /**
     * @notice Get the underlying price of a listed cToken asset
     * @param cToken The cToken to get the underlying price of
     * @return The underlying asset price mantissa (scaled by 1e18)
     */
    function getUnderlyingPrice(CToken cToken) public view returns (uint) {
        address cTokenAddress = address(cToken);

        if (cTokenAddress == cEthAddress) {
            // ether always worth 1
            return 1e18;
        }

        if (cTokenAddress == cUsdcAddress) {
            MathError mathErr;
            Exp memory price;

            (mathErr, price) = getPriceFromChainlink(usdcAggregator);
            if (mathErr != MathError.NO_ERROR) {
                // Fallback to v1 PriceOracle
                return getPriceFromV1(cTokenAddress);
            }
            (mathErr, price) = mulScalar(price, usdScale);
            if (mathErr != MathError.NO_ERROR ) {
                // Fallback to v1 PriceOracle
                return getPriceFromV1(cTokenAddress);
            }
            if (price.mantissa <= 0) {
                return getPriceFromV1(cTokenAddress);
            }
            return price.mantissa;
        }

        if (cTokenAddress == cUsdtAddress) {
            MathError mathErr;
            Exp memory price;

            (mathErr, price) = getPriceFromChainlink(usdtAggregator);
            if (mathErr != MathError.NO_ERROR) {
                // Fallback to v1 PriceOracle
                return getPriceFromV1(cTokenAddress);
            }
            (mathErr, price) = mulScalar(price, usdScale);
            if (mathErr != MathError.NO_ERROR ) {
                // Fallback to v1 PriceOracle
                return getPriceFromV1(cTokenAddress);
            }
            if (price.mantissa <= 0) {
                return getPriceFromV1(cTokenAddress);
            }
            return price.mantissa;
        }
        // otherwise just read from v1 oracle
        return getPriceFromV1(cTokenAddress);
    }

    function getPriceFromChainlink(address aggregatorAddress) internal view returns (MathError, Exp memory) {
        AggregatorInterface aggregator = AggregatorInterface(aggregatorAddress);
        int256 chainLinkPrice = aggregator.latestAnswer();
        if (chainLinkPrice <= 0) {
            return (MathError.INTEGER_OVERFLOW, Exp({mantissa: 0}));
        }
        return (MathError.NO_ERROR, Exp({mantissa: uint(aggregator.latestAnswer())}));
    }

    function getPriceFromV1(address cTokenAddress) internal view returns (uint) {
        address underlying = CErc20(cTokenAddress).underlying();
        return v1PriceOracle.assetPrices(underlying);
    }
}
