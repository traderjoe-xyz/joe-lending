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

// Ref: https://github.com/Uniswap/uniswap-v2-core/blob/master/contracts/interfaces/IUniswapV2Pair.sol
interface IUniswapV2Pair {
    event Approval(address indexed owner, address indexed spender, uint value);
    event Transfer(address indexed from, address indexed to, uint value);

    function name() external pure returns (string memory);

    function symbol() external pure returns (string memory);

    function decimals() external pure returns (uint8);

    function totalSupply() external view returns (uint);

    function balanceOf(address owner) external view returns (uint);

    function allowance(address owner, address spender) external view returns (uint);

    function approve(address spender, uint value) external returns (bool);

    function transfer(address to, uint value) external returns (bool);

    function transferFrom(
        address from,
        address to,
        uint value
    ) external returns (bool);

    function DOMAIN_SEPARATOR() external view returns (bytes32);

    function PERMIT_TYPEHASH() external pure returns (bytes32);

    function nonces(address owner) external view returns (uint);

    function permit(
        address owner,
        address spender,
        uint value,
        uint deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    event Mint(address indexed sender, uint amount0, uint amount1);
    event Burn(address indexed sender, uint amount0, uint amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint amount0In,
        uint amount1In,
        uint amount0Out,
        uint amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    function MINIMUM_LIQUIDITY() external pure returns (uint);

    function factory() external view returns (address);

    function token0() external view returns (address);

    function token1() external view returns (address);

    function getReserves()
        external
        view
        returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 blockTimestampLast
        );

    function price0CumulativeLast() external view returns (uint);

    function price1CumulativeLast() external view returns (uint);

    function kLast() external view returns (uint);

    function mint(address to) external returns (uint liquidity);

    function burn(address to) external returns (uint amount0, uint amount1);

    function swap(
        uint amount0Out,
        uint amount1Out,
        address to,
        bytes calldata data
    ) external;

    function skim(address to) external;

    function sync() external;

    function initialize(address, address) external;
}

contract PriceOracleProxy is PriceOracle, Exponential {
    address public admin;

    /// @notice Indicator that this is a PriceOracle contract (for inspection)
    bool public constant isPriceOracle = true;

    /// @notice The v1 price oracle, which will continue to serve prices for v1 assets
    V1PriceOracleInterface public v1PriceOracle;

    /// @notice Chainlink Aggregators
    mapping(address => AggregatorV3Interface) public aggregators;

    /// @notice Check if the address is Uniswap or SushiSwap LP
    mapping(address => bool) public areLPs;

    address public cEthAddress;
    address public cUsdcAddress;
    address public cYcrvAddress;
    address public cYusdAddress;
    address public cYethAddress;

    address public constant wethAddress = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    /**
     * @param admin_ The address of admin to set aggregators
     * @param v1PriceOracle_ The address of the v1 price oracle, which will continue to operate and hold prices for collateral assets
     * @param cEthAddress_ The address of cETH, which will return a constant 1e18, since all prices relative to ether
     * @param cUsdcAddress_ The address of cUSDC
     * @param cYcrvAddress_ The address of cYcrv
     * @param cYusdAddress_ The address of cYusd
     * @param cYethAddress_ The address of cYeth
     */
    constructor(address admin_,
                address v1PriceOracle_,
                address cEthAddress_,
                address cUsdcAddress_,
                address cYcrvAddress_,
                address cYusdAddress_,
                address cYethAddress_) public {
        admin = admin_;
        v1PriceOracle = V1PriceOracleInterface(v1PriceOracle_);
        cEthAddress = cEthAddress_;
        cUsdcAddress = cUsdcAddress_;
        cYcrvAddress = cYcrvAddress_;
        cYusdAddress = cYusdAddress_;
        cYethAddress = cYethAddress_;
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

        address underlying = CErc20(cTokenAddress).underlying();
        if (cTokenAddress == cYethAddress) {
            uint yVaultPrice = YVaultInterface(0xe1237aA7f535b0CC33Fd973D66cBf830354D16c7).getPricePerFullShare();
            if (yVaultPrice == 0) {
                return getPriceFromV1(underlying);
            }
            return yVaultPrice;
        }

        if (cTokenAddress == cYcrvAddress || cTokenAddress == cYusdAddress) {
            // ETH/USDC (treat USDC as USD)
            uint ethUsdPrice = getUnderlyingPrice(CToken(cUsdcAddress)) / 1e12;
            if (ethUsdPrice == 0) {
                return 0;
            }

            // YCRV/USD
            uint virtualPrice = CurveSwapInterface(0x45F783CCE6B7FF23B2ab2D70e416cdb7D6055f51).get_virtual_price();

            // YCRV/ETH = USD/ETH * YCRV/USD
            uint yCrvPrice = mul_(ethUsdPrice, Exp({mantissa: virtualPrice}));

            if (cTokenAddress == cYusdAddress) {
                // YUSD/YCRV
                uint yVaultPrice = YVaultInterface(0x5dbcF33D8c2E976c6b560249878e6F1491Bca25c).getPricePerFullShare();

                // YUSD/ETH = YCRV/ETH * YUSD/YCRV
                uint yUSDPrice = mul_(yCrvPrice, Exp({mantissa: yVaultPrice}));
                return yUSDPrice;
            }
            return yCrvPrice;
        }

        if (areLPs[underlying]) {
            return getLPFairPrice(underlying);
        }

        return getTokenPrice(underlying);
    }

    /*** Internal fucntions ***/

    /**
     * @notice Get the price of a specific token. Return 1e18 is it's WETH.
     * @param token The token to get the price of
     * @return The price
     */
    function getTokenPrice(address token) internal view returns (uint) {
        if (token == wethAddress) {
            // weth always worth 1
            return 1e18;
        }

        AggregatorV3Interface aggregator = aggregators[token];
        if (address(aggregator) != address(0)) {
            uint price = getPriceFromChainlink(aggregator);
            uint underlyingDecimals = EIP20Interface(token).decimals();
            return mul_(price, 10**(18 - underlyingDecimals));
        }
        return getPriceFromV1(token);
    }

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
     * @notice Get the fair price of a LP. We use the mechanism from Alpha Finance.
     *         Ref: https://blog.alphafinance.io/fair-lp-token-pricing/
     * @param pair The pair of AMM (Uniswap or SushiSwap)
     * @return The price
     */
    function getLPFairPrice(address pair) internal view returns (uint) {
        address token0 = IUniswapV2Pair(pair).token0();
        address token1 = IUniswapV2Pair(pair).token1();
        uint totalSupply = IUniswapV2Pair(pair).totalSupply();
        (uint r0, uint r1, ) = IUniswapV2Pair(pair).getReserves();
        uint sqrtR = sqrt(mul_(r0, r1));
        uint p0 = getTokenPrice(token0);
        uint p1 = getTokenPrice(token1);
        uint sqrtP = sqrt(mul_(p0, p1));
        return div_(mul_(2, mul_(sqrtR, sqrtP)), totalSupply);
    }

    /**
     * @notice Get price from v1 price oracle
     * @param token The token to get the price of
     * @return The price
     */
    function getPriceFromV1(address token) internal view returns (uint) {
        return v1PriceOracle.assetPrices(token);
    }

    event AggregatorUpdated(address tokenAddress, address source);
    event IsLPUpdated(address tokenAddress, bool isLP);

    function _setAggregators(address[] calldata tokenAddresses, address[] calldata sources) external {
        require(msg.sender == admin, "only the admin may set the aggregators");
        require(tokenAddresses.length == sources.length, "mismatched data");
        for (uint i = 0; i < tokenAddresses.length; i++) {
            aggregators[tokenAddresses[i]] = AggregatorV3Interface(sources[i]);
            emit AggregatorUpdated(tokenAddresses[i], sources[i]);
        }
    }

    function _setLPs(address[] calldata tokenAddresses, bool[] calldata isLP) external {
        require(msg.sender == admin, "only the admin may set LPs");
        require(tokenAddresses.length == isLP.length, "mismatched data");
        for (uint i = 0; i < tokenAddresses.length; i++) {
            areLPs[tokenAddresses[i]] = isLP[i];
            emit IsLPUpdated(tokenAddresses[i], isLP[i]);
        }
    }

    function _setAdmin(address _admin) external {
        require(msg.sender == admin, "only the admin may set new admin");
        admin = _admin;
    }
}
