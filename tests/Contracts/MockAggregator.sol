pragma solidity ^0.5.16;

import "../../contracts/PriceOracle/interfaces/FeedRegistryInterface.sol";

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

contract MockAggregator {
    string public constant description = "mock aggregator";
    uint256 public constant version = 1;
    uint80 public constant roundId = 1;

    uint8 public decimals = 18;
    int256 public answer;

    constructor(int256 _answer) public {
        answer = _answer;
    }

    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80,
            int256,
            uint256,
            uint256,
            uint80
        )
    {
        // Shh
        _roundId;

        return (roundId, answer, block.timestamp, block.timestamp, roundId);
    }

    function latestRoundData()
        external
        view
        returns (
            uint80,
            int256,
            uint256,
            uint256,
            uint80
        )
    {
        return (roundId, answer, block.timestamp, block.timestamp, roundId);
    }

    function setAnswer(int256 _answer) external {
        answer = _answer;
    }

    function setDecimals(uint8 _decimals) external {
        decimals = _decimals;
    }
}

contract MockRegistry is FeedRegistryInterface {
    uint80 public constant roundId = 1;

    int256 public answer;
    bool public getFeedFailed;
    bool public feedDisabled;

    constructor(int256 _answer) public {
        answer = _answer;
    }

    function getRoundData(
        address base,
        address quote,
        uint80 _roundId
    )
        external
        view
        returns (
            uint80,
            int256,
            uint256,
            uint256,
            uint80
        )
    {
        // Shh
        base;
        quote;
        _roundId;
        return (roundId, answer, block.timestamp, block.timestamp, roundId);
    }

    function latestRoundData(address base, address quote)
        external
        view
        returns (
            uint80,
            int256,
            uint256,
            uint256,
            uint80
        )
    {
        // Shh
        base;
        quote;
        return (roundId, answer, block.timestamp, block.timestamp, roundId);
    }

    function decimals(address base, address quote) external view returns (uint8) {
        // Shh
        base;
        quote;
        return 18;
    }

    function description(address base, address quote) external view returns (string memory) {
        // Shh
        base;
        quote;
        return "mock aggregator";
    }

    function version(address base, address quote) external view returns (uint256) {
        // Shh
        base;
        quote;
        return 1;
    }

    function getFeed(address base, address quote) external view returns (address) {
        // Shh
        base;
        quote;

        if (getFeedFailed) {
            revert("Feed not found");
        }
        return address(0);
    }

    function isFeedEnabled(address aggregator) external view returns (bool) {
        // Shh
        aggregator;

        if (feedDisabled) {
            return false;
        }
        return true;
    }

    function setGetFeedFailed(bool failed) external {
        getFeedFailed = failed;
    }

    function setFeedDisabled(bool disabled) external {
        feedDisabled = disabled;
    }

    function setAnswer(int256 _answer) external {
        answer = _answer;
    }
}
