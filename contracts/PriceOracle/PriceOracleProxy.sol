pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./Denominations.sol";
import "./PriceOracle.sol";
import "./interfaces/CurveTokenInterface.sol";
import "./interfaces/FeedRegistryInterface.sol";
import "./interfaces/UniswapV2Interface.sol";
import "./interfaces/V1PriceOracleInterface.sol";
import "./interfaces/XSushiExchangeRateInterface.sol";
import "./interfaces/YVaultTokenInterface.sol";
import "../CErc20.sol";
import "../CToken.sol";
import "../Exponential.sol";
import "../EIP20Interface.sol";

contract PriceOracleProxy is PriceOracle, Exponential, Denominations {
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
        CurvePoolType poolType;
        /// @notice The curve swap contract address
        address curveSwap;
    }

    struct AggregatorInfo {
        /// @notice The base
        address base;
        /// @notice The quote denomination
        address quote;
        /// @notice It's being used or not
        bool isUsed;
    }

    /// @notice Admin address
    address public admin;

    /// @notice Guardian address
    address public guardian;

    /// @notice Indicator that this is a PriceOracle contract (for inspection)
    bool public constant isPriceOracle = true;

    /// @notice The v1 price oracle, which will continue to serve prices for v1 assets
    V1PriceOracleInterface public v1PriceOracle;

    /// @notice The ChainLink registry address
    FeedRegistryInterface public registry;

    /// @notice ChainLink quotes
    mapping(address => AggregatorInfo) public aggregators;

    /// @notice Check if the underlying address is Uniswap or SushiSwap LP
    mapping(address => bool) public isUnderlyingLP;

    /// @notice Yvault token data
    mapping(address => YvTokenInfo) public yvTokens;

    /// @notice Curve pool token data
    mapping(address => CrvTokenInfo) public crvTokens;

    /// @notice BTC related addresses. All these underlying we use `Denominations.BTC` as the aggregator base.
    address[6] public btcAddresses = [
        0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599, // WBTC
        0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D, // renBTC
        0x9BE89D2a4cd102D8Fecc6BF9dA793be995C22541, // BBTC
        0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa, // tBTC
        0x0316EB71485b0Ab14103307bf65a021042c6d380, // HBTC
        0xc4E15973E6fF2A35cC804c2CF9D2a1b817a8b40F // ibBTC
    ];

    address public cEthAddress;

    address public constant usdcAddress = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant wethAddress = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant sushiAddress = 0x6B3595068778DD592e39A122f4f5a5cF09C90fE2;
    address public constant xSushiExRateAddress = 0x851a040fC0Dcbb13a272EBC272F2bC2Ce1e11C4d;
    address public constant crXSushiAddress = 0x228619CCa194Fbe3Ebeb2f835eC1eA5080DaFbb2;

    /**
     * @param admin_ The address of admin to set aggregators, LPs, curve tokens, or Yvault tokens
     * @param v1PriceOracle_ The address of the v1 price oracle, which will continue to operate and hold prices for collateral assets
     * @param cEthAddress_ The address of cETH, which will return a constant 1e18, since all prices relative to ether
     * @param registry_ The address of ChainLink registry
     */
    constructor(
        address admin_,
        address v1PriceOracle_,
        address cEthAddress_,
        address registry_
    ) public {
        admin = admin_;
        v1PriceOracle = V1PriceOracleInterface(v1PriceOracle_);
        cEthAddress = cEthAddress_;
        registry = FeedRegistryInterface(registry_);
    }

    /**
     * @notice Get the underlying price of a listed cToken asset
     * @param cToken The cToken to get the underlying price of
     * @return The underlying asset price mantissa (scaled by 1e18)
     */
    function getUnderlyingPrice(CToken cToken) public view returns (uint256) {
        address cTokenAddress = address(cToken);
        if (cTokenAddress == cEthAddress) {
            // ether always worth 1
            return 1e18;
        } else if (cTokenAddress == crXSushiAddress) {
            // Handle xSUSHI.
            uint256 exchangeRate = XSushiExchangeRateInterface(xSushiExRateAddress).getExchangeRate();
            return mul_(getTokenPrice(sushiAddress), Exp({mantissa: exchangeRate}));
        }

        address underlying = CErc20(cTokenAddress).underlying();

        // Handle LP tokens.
        if (isUnderlyingLP[underlying]) {
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
    function getTokenPrice(address token) internal view returns (uint256) {
        if (token == wethAddress) {
            // weth always worth 1
            return 1e18;
        }

        AggregatorInfo memory aggregatorInfo = aggregators[token];
        if (aggregatorInfo.isUsed) {
            uint256 price = getPriceFromChainlink(aggregatorInfo.base, aggregatorInfo.quote);
            if (aggregatorInfo.quote == Denominations.USD) {
                // Convert the price to ETH based if it's USD based.
                price = mul_(price, Exp({mantissa: getUsdcEthPrice()}));
            }
            uint256 underlyingDecimals = EIP20Interface(token).decimals();
            return mul_(price, 10**(18 - underlyingDecimals));
        }
        return getPriceFromV1(token);
    }

    /**
     * @notice Get price from ChainLink
     * @param base The base token that ChainLink aggregator gets the price of
     * @param quote The quote token, currenlty support ETH and USD
     * @return The price, scaled by 1e18
     */
    function getPriceFromChainlink(address base, address quote) internal view returns (uint256) {
        (, int256 price, , , ) = registry.latestRoundData(base, quote);
        require(price > 0, "invalid price");

        // Extend the decimals to 1e18.
        return mul_(uint256(price), 10**(18 - uint256(registry.decimals(base, quote))));
    }

    /**
     * @notice Get the fair price of a LP. We use the mechanism from Alpha Finance.
     *         Ref: https://blog.alphafinance.io/fair-lp-token-pricing/
     * @param pair The pair of AMM (Uniswap or SushiSwap)
     * @return The price
     */
    function getLPFairPrice(address pair) internal view returns (uint256) {
        address token0 = IUniswapV2Pair(pair).token0();
        address token1 = IUniswapV2Pair(pair).token1();
        uint256 totalSupply = IUniswapV2Pair(pair).totalSupply();
        (uint256 r0, uint256 r1, ) = IUniswapV2Pair(pair).getReserves();
        uint256 sqrtR = sqrt(mul_(r0, r1));
        uint256 p0 = getTokenPrice(token0);
        uint256 p1 = getTokenPrice(token1);
        uint256 sqrtP = sqrt(mul_(p0, p1));
        return div_(mul_(2, mul_(sqrtR, sqrtP)), totalSupply);
    }

    /**
     * @notice Get price for Yvault tokens
     * @param token The Yvault token
     * @return The price
     */
    function getYvTokenPrice(address token) internal view returns (uint256) {
        YvTokenInfo memory yvTokenInfo = yvTokens[token];
        require(yvTokenInfo.isYvToken, "not a Yvault token");

        uint256 pricePerShare;
        address underlying;
        if (yvTokenInfo.version == YvTokenVersion.V1) {
            pricePerShare = YVaultV1Interface(token).getPricePerFullShare();
            underlying = YVaultV1Interface(token).token();
        } else {
            pricePerShare = YVaultV2Interface(token).pricePerShare();
            underlying = YVaultV2Interface(token).token();
        }

        uint256 underlyingPrice;
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
    function getCrvTokenPrice(address token) internal view returns (uint256) {
        CrvTokenInfo memory crvTokenInfo = crvTokens[token];
        require(crvTokenInfo.isCrvToken, "not a curve pool token");

        uint256 virtualPrice = CurveSwapInterface(crvTokenInfo.curveSwap).get_virtual_price();
        if (crvTokenInfo.poolType == CurvePoolType.ETH) {
            return virtualPrice;
        }

        // We treat USDC as USD and convert the price to ETH base.
        return mul_(getUsdcEthPrice(), Exp({mantissa: virtualPrice}));
    }

    /**
     * @notice Get USDC price
     * @dev We treat USDC as USD for convenience
     * @return The USDC price
     */
    function getUsdcEthPrice() internal view returns (uint256) {
        return getTokenPrice(usdcAddress) / 1e12;
    }

    /**
     * @notice Get price from v1 price oracle
     * @param token The token to get the price of
     * @return The price
     */
    function getPriceFromV1(address token) internal view returns (uint256) {
        return v1PriceOracle.assetPrices(token);
    }

    /**
     * @notice Compare two strings are the same or not
     * @param a The first string
     * @param b The second string
     * @return The same or not
     */
    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    /**
     * @notice Check if the token is one of BTC relared address
     * @param token The token address
     * @return It's BTC or not
     */
    function isBtcAddress(address token) internal returns (bool) {
        for (uint256 i = 0; i < btcAddresses.length; i++) {
            if (btcAddresses[i] == token) {
                return true;
            }
        }
        return false;
    }

    /*** Admin or guardian functions ***/

    event AggregatorUpdated(address tokenAddress, address base, address quote, bool isUsed);
    event IsLPUpdated(address tokenAddress, bool isLP);
    event SetYVaultToken(address token, YvTokenVersion version);
    event SetCurveToken(address token, CurvePoolType poolType, address swap);
    event SetGuardian(address guardian);
    event SetAdmin(address admin);

    /**
     * @notice Set ChainLink aggregators for multiple tokens
     * @param tokenAddresses The list of underlying tokens
     * @param quotes The list of ChainLink aggregator quotes, currently support 'ETH' and 'USD'
     */
    function _setAggregators(address[] calldata tokenAddresses, string[] calldata quotes) external {
        require(msg.sender == admin || msg.sender == guardian, "only the admin or guardian may set the aggregators");
        require(tokenAddresses.length == quotes.length, "mismatched data");
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            address base;
            address quote;
            bool isUsed;
            if (bytes(quotes[i]).length != 0) {
                require(msg.sender == admin, "guardian may only clear the aggregator");
                isUsed = true;

                base = tokenAddresses[i];
                if (isBtcAddress(tokenAddresses[i])) {
                    base = Denominations.BTC;
                }

                if (compareStrings(quotes[i], "ETH")) {
                    quote = Denominations.ETH;
                } else if (compareStrings(quotes[i], "USD")) {
                    quote = Denominations.USD;
                } else {
                    revert("unsupported denomination");
                }

                // Make sure the aggregator exists.
                address aggregator = registry.getFeed(base, quote);
                require(registry.isFeedEnabled(aggregator), "aggregator not enabled");
            }
            aggregators[tokenAddresses[i]] = AggregatorInfo({base: base, quote: quote, isUsed: isUsed});
            emit AggregatorUpdated(tokenAddresses[i], base, quote, isUsed);
        }
    }

    /**
     * @notice See assets as LP tokens for multiple tokens
     * @param tokenAddresses The list of tokens
     * @param isLP The list of cToken properties (it's LP or not)
     */
    function _setLPs(address[] calldata tokenAddresses, bool[] calldata isLP) external {
        require(msg.sender == admin, "only the admin may set LPs");
        require(tokenAddresses.length == isLP.length, "mismatched data");
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            isUnderlyingLP[tokenAddresses[i]] = isLP[i];
            if (isLP[i]) {
                // Sanity check to make sure the token is LP.
                IUniswapV2Pair(tokenAddresses[i]).token0();
                IUniswapV2Pair(tokenAddresses[i]).token1();
            }
            emit IsLPUpdated(tokenAddresses[i], isLP[i]);
        }
    }

    /**
     * @notice See assets as Yvault tokens for multiple tokens
     * @param tokenAddresses The list of tokens
     * @param version The list of vault version
     */
    function _setYVaultTokens(address[] calldata tokenAddresses, YvTokenVersion[] calldata version) external {
        require(msg.sender == admin, "only the admin may set Yvault tokens");
        require(tokenAddresses.length == version.length, "mismatched data");
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
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
     * @notice See assets as curve pool tokens for multiple tokens
     * @param tokenAddresses The list of tokens
     * @param poolType The list of curve pool type (ETH or USD base only)
     * @param swap The list of curve swap address
     */
    function _setCurveTokens(
        address[] calldata tokenAddresses,
        CurveTokenVersion[] calldata version,
        CurvePoolType[] calldata poolType,
        address[] calldata swap
    ) external {
        require(msg.sender == admin, "only the admin may set curve pool tokens");
        require(
            tokenAddresses.length == version.length &&
                tokenAddresses.length == poolType.length &&
                tokenAddresses.length == swap.length,
            "mismatched data"
        );
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            if (version[i] == CurveTokenVersion.V3) {
                // Sanity check to make sure the token minter is right.
                require(CurveTokenV3Interface(tokenAddresses[i]).minter() == swap[i], "incorrect pool");
            }

            crvTokens[tokenAddresses[i]] = CrvTokenInfo({isCrvToken: true, poolType: poolType[i], curveSwap: swap[i]});
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
