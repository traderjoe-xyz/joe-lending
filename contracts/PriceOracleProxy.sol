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

interface CurveTokenV3Interface {
    function minter() external view returns (address);
}

interface YVaultV1Interface {
    function token() external view returns (address);
    function getPricePerFullShare() external view returns (uint);
}

interface YVaultV2Interface {
    function token() external view returns (address);
    function pricePerShare() external view returns (uint);
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

interface IXSushiExchangeRate {
    function getExchangeRate() external view returns (uint);
}

contract PriceOracleProxy is PriceOracle, Exponential {
    /// @notice Yvault token version, currently support v1 and v2
    enum YvTokenVersion {
        V1,
        V2
    }

    /// @notice Curve token version, currently support v1, v2 and v3
    enum CurveTokenVersion {
        V1,
        V2,
        V3
    }

    /// @notice Curve pool type, currently support ETH and USD base
    enum CurvePoolType {
        ETH,
        USD
    }

    struct YvTokenInfo {
        /// @notice Check if this token is a Yvault token
        bool isYvToken;

        /// @notice The version of Yvault
        YvTokenVersion version;
    }

    struct CrvTokenInfo {
        /// @notice Check if this token is a curve pool token
        bool isCrvToken;

        /// @notice The curve pool type
        CurvePoolType poolTpye;

        /// @notice The curve swap contract address
        address curveSwap;
    }

    /// @notice Admin address
    address public admin;

    /// @notice Guardian address
    address public guardian;

    /// @notice Indicator that this is a PriceOracle contract (for inspection)
    bool public constant isPriceOracle = true;

    /// @notice The v1 price oracle, which will continue to serve prices for v1 assets
    V1PriceOracleInterface public v1PriceOracle;

    /// @notice Chainlink Aggregators
    mapping(address => AggregatorV3Interface) public aggregators;

    /// @notice Check if the underlying address is Uniswap or SushiSwap LP
    mapping(address => bool) public areUnderlyingLPs;

    /// @notice Yvault token data
    mapping(address => YvTokenInfo) public yvTokens;

    /// @notice Curve pool token data
    mapping(address => CrvTokenInfo) public crvTokens;

    address public cEthAddress;
    address public cXSushiAddress;

    address public constant usdcAddress = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant wethAddress = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant sushiAddress = 0x6B3595068778DD592e39A122f4f5a5cF09C90fE2;
    address public constant xSushiExRateAddress = 0x851a040fC0Dcbb13a272EBC272F2bC2Ce1e11C4d;

    /**
     * @param admin_ The address of admin to set aggregators
     * @param v1PriceOracle_ The address of the v1 price oracle, which will continue to operate and hold prices for collateral assets
     * @param cEthAddress_ The address of cETH, which will return a constant 1e18, since all prices relative to ether
     * @param cXSushiAddress_ The address of cXSushi
     */
    constructor(address admin_,
                address v1PriceOracle_,
                address cEthAddress_,
                address cXSushiAddress_) public {
        admin = admin_;
        v1PriceOracle = V1PriceOracleInterface(v1PriceOracle_);
        cEthAddress = cEthAddress_;
        cXSushiAddress = cXSushiAddress_;
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

        // Handle xSUSHI.
        if (cTokenAddress == cXSushiAddress) {
            uint exchangeRate = IXSushiExchangeRate(xSushiExRateAddress).getExchangeRate();
            return mul_(getTokenPrice(sushiAddress), Exp({mantissa: exchangeRate}));
        }

        address underlying = CErc20(cTokenAddress).underlying();

        // Handle LP tokens.
        if (areUnderlyingLPs[cTokenAddress]) {
            return getLPFairPrice(underlying);
        }

        // Handle Yvault tokens.
        if (yvTokens[underlying].isYvToken) {
            return getYvTokenPrice(underlying);
        }

        // Handle curve pool tokens.
        if (crvTokens[underlying].isCrvToken) {
            return getCrvTokenPrice(underlying);
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
     * @notice Get price for Yvault tokens
     * @param token The Yvault token
     * @return The price
     */
    function getYvTokenPrice(address token) internal view returns (uint) {
        YvTokenInfo memory yvTokenInfo = yvTokens[token];
        require(yvTokenInfo.isYvToken, "not a Yvault token");

        uint pricePerShare;
        address underlying;
        if (yvTokenInfo.version == YvTokenVersion.V1) {
            pricePerShare = YVaultV1Interface(token).getPricePerFullShare();
            underlying = YVaultV1Interface(token).token();
        } else {
            pricePerShare = YVaultV2Interface(token).pricePerShare();
            underlying = YVaultV2Interface(token).token();
        }

        uint underlyingPrice;
        if (crvTokens[underlying].isCrvToken) {
            underlyingPrice = getCrvTokenPrice(underlying);
        } else {
            underlyingPrice = getTokenPrice(underlying);
        }
        return mul_(underlyingPrice, Exp({mantissa: pricePerShare}));
    }

    /**
     * @notice Get price for curve pool tokens
     * @param token The curve pool token
     * @return The price
     */
    function getCrvTokenPrice(address token) internal view returns (uint) {
        CrvTokenInfo memory crvTokenInfo = crvTokens[token];
        require(crvTokenInfo.isCrvToken, "not a curve pool token");

        uint virtualPrice = CurveSwapInterface(crvTokenInfo.curveSwap).get_virtual_price();
        if (crvTokenInfo.poolTpye == CurvePoolType.ETH) {
            return virtualPrice;
        }

        // We treat USDC as USD and convert the price to ETH base.
        uint usdEthPrice = getTokenPrice(usdcAddress) / 1e12;
        return mul_(usdEthPrice, Exp({mantissa: virtualPrice}));
    }

    /**
     * @notice Get price from v1 price oracle
     * @param token The token to get the price of
     * @return The price
     */
    function getPriceFromV1(address token) internal view returns (uint) {
        return v1PriceOracle.assetPrices(token);
    }

    /*** Admin or guardian functions ***/

    event AggregatorUpdated(address tokenAddress, address source);
    event IsLPUpdated(address tokenAddress, bool isLP);
    event SetYVaultToken(address token, YvTokenVersion version);
    event SetCurveToken(address token, CurvePoolType poolType, address swap);
    event SetGuardian(address guardian);
    event SetAdmin(address admin);

    /**
     * @notice Set ChainLink aggregators for multiple cTokens
     * @param tokenAddresses The list of underlying tokens
     * @param sources The list of ChainLink aggregator sources
     */
    function _setAggregators(address[] calldata tokenAddresses, address[] calldata sources) external {
        require(msg.sender == admin || msg.sender == guardian, "only the admin or guardian may set the aggregators");
        require(tokenAddresses.length == sources.length, "mismatched data");
        for (uint i = 0; i < tokenAddresses.length; i++) {
            if (sources[i] != address(0)) {
                require(msg.sender == admin, "guardian may only clear the aggregator");
            }
            aggregators[tokenAddresses[i]] = AggregatorV3Interface(sources[i]);
            emit AggregatorUpdated(tokenAddresses[i], sources[i]);
        }
    }

    /**
     * @notice See assets as LP tokens for multiple cTokens
     * @param cTokenAddresses The list of cTokens
     * @param isLP The list of cToken properties (it's LP or not)
     */
    function _setLPs(address[] calldata cTokenAddresses, bool[] calldata isLP) external {
        require(msg.sender == admin, "only the admin may set LPs");
        require(cTokenAddresses.length == isLP.length, "mismatched data");
        for (uint i = 0; i < cTokenAddresses.length; i++) {
            areUnderlyingLPs[cTokenAddresses[i]] = isLP[i];
            emit IsLPUpdated(cTokenAddresses[i], isLP[i]);
        }
    }

    /**
     * @notice See assets as Yvault tokens for multiple cTokens
     * @param tokenAddresses The list of underlying tokens
     * @param version The list of vault version
     */
    function _setYVaultTokens(address[] calldata tokenAddresses, YvTokenVersion[] calldata version) external {
        require(msg.sender == admin, "only the admin may set Yvault tokens");
        require(tokenAddresses.length == version.length, "mismatched data");
        for (uint i = 0; i < tokenAddresses.length; i++) {
            // Sanity check to make sure version is right.
            if (version[i] == YvTokenVersion.V1) {
                YVaultV1Interface(tokenAddresses[i]).getPricePerFullShare();
            } else {
                YVaultV2Interface(tokenAddresses[i]).pricePerShare();
            }

            yvTokens[tokenAddresses[i]] = YvTokenInfo({isYvToken: true, version: version[i]});
            emit SetYVaultToken(tokenAddresses[i], version[i]);
        }
    }

    /**
     * @notice See assets as curve pool tokens for multiple cTokens
     * @param tokenAddresses The list of underlying tokens
     * @param poolType The list of curve pool type (ETH or USD base only)
     * @param swap The list of curve swap address
     */
    function _setCurveTokens(address[] calldata tokenAddresses, CurveTokenVersion[] calldata version, CurvePoolType[] calldata poolType, address[] calldata swap) external {
        require(msg.sender == admin, "only the admin may set curve pool tokens");
        require(tokenAddresses.length == version.length && tokenAddresses.length == poolType.length && tokenAddresses.length == swap.length, "mismatched data");
        for (uint i = 0; i < tokenAddresses.length; i++) {
            if (version[i] == CurveTokenVersion.V3) {
                // Sanity check to make sure the token minter is right.
                require(CurveTokenV3Interface(tokenAddresses[i]).minter() == swap[i], "incorrect pool");
            }

            crvTokens[tokenAddresses[i]] = CrvTokenInfo({isCrvToken: true, poolTpye: poolType[i], curveSwap: swap[i]});
            emit SetCurveToken(tokenAddresses[i], poolType[i], swap[i]);
        }
    }

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
}
