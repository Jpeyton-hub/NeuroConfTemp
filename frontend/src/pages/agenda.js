import { Link } from "gatsby"
import momentLocalize from "moment"
import moment from "moment-timezone"
import React, { useEffect, useState } from "react"
import { Calendar, momentLocalizer, Views } from "react-big-calendar"
import "react-big-calendar/lib/css/react-big-calendar.css"
import styled from "styled-components"
import AbstractModal from "../components/AbstractBrowser/AbstractModal"
import CommonPageStyles from "../components/BaseComponents/CommonPageStyles"
import HeadingWithButtonContainer from "../components/BaseComponents/HeadingWithButtonContainer"
import Layout from "../components/layout"
import TimezoneEditionModal from "../components/TimezoneEditionModal"
import useAPI from "../hooks/useAPI"
import useDisplayEdition, {
  talkFormatLabelColors,
} from "../hooks/useDisplayEdition"
import useEventTime from "../hooks/useEventTime"
import useFirebaseWrapper from "../hooks/useFirebaseWrapper"
import useTimezone from "../hooks/useTimezone"
import { growOverParentPadding, media } from "../styles"
// import useValidateRegistration from '../hooks/useValidateRegistration';
import Fa from "../utils/fontawesome"

// -- CONSTANTS
const localizer = momentLocalizer(momentLocalize)

// -- FUNCTIONS
const getColorOfTalkFormat = talkFormat => talkFormatLabelColors[talkFormat]

// -- COMPONENTS
const BoldText = styled.span`
  font-weight: bold;
`

const NoticeBox = styled.p`
  text-align: center;
  border: 2px solid rgb(248, 42, 96);
  padding: 12px 0;
`

const BigCalendarContainer = styled.div`
  .rbc-allday-cell {
    display: none;
  }
  .rbc-time-view .rbc-header {
    border-bottom: none;
  }
  /* hide time on card to create more space */
  .rbc-event-label {
    display: none;
  }
  /* adjust event font size */
  .rbc-event-content {
    font-size: 0.675em;
  }
  /* reset event color */
  .rbc-day-slot {
    .rbc-event {
      background-color: white;
      color: #333333;
      border: 1px solid #ccc;
    }
  }
  /* styling label */
  .rbc-toolbar {
    .rbc-toolbar-label {
      font-size: 1.5em;
      font-weight: bold;

      flex-grow: 0;
      padding-left: 20px;
      padding-right: 20px;

      ${media.extraSmall`
        padding-left: 10px;
        padding-right: 10px;
      `}
    }
  }

  .rbc-time-view-resources .rbc-time-gutter,
  .rbc-time-view-resources .rbc-time-header-gutter {
    background-color: ${p => p.theme.colors.primary};
  }

  .rbc-label,
  .rbc-time-header,
  .rbc-toolbar button {
    color: ${p => p.theme.colors.secondary};
  }

  ${growOverParentPadding(96)}
`

// handle convert datatime
const handleConvertDatetime = (data, tz) => {
  let minT
  let maxT
  const converted = data.map(({ starttime, endtime, ...rest }, ind) => {
    // there is a situation where start time and end time is in different day
    // we should handle this by splitting that into 2 events and add to label (continue)
    // endtime of the first split is cut to 00:00 and the same goes with starttime of the other
    const convertedStart = new Date(
      moment
        .utc(starttime)
        .tz(tz)
        .format("MMM DD, YYYY HH:mm")
    )
    const convertedEnd = new Date(
      moment
        .utc(endtime)
        .tz(tz)
        .format("MMM DD, YYYY HH:mm")
    )

    if (ind === 0) {
      minT = convertedStart
    }

    if (ind === data.length - 1) {
      maxT = convertedEnd
    }

    return {
      start: convertedStart,
      end: convertedEnd,
      allDay: false,
      // passthrough modal
      starttime,
      endtime,
      ...rest,
    }
  })

  return {
    converted,
    minT,
    maxT,
  }
}

// need to make this a curry function to pass eventTimeBoundary in
const CustomBar = eventTimeBoundary => ({
  /* eslint-disable react/prop-types */
  onNavigate,
  label,
  date,
  /* eslint-enable react/prop-types */
}) => {
  if (!eventTimeBoundary) {
    return null
  }

  // eslint-disable-next-line react/prop-types
  const current = new Date(date.toDateString())
  const lowerBound = new Date(eventTimeBoundary[0].toDateString())
  const upperBound = new Date(eventTimeBoundary[1].toDateString())

  // console.log('in CustomBar bound0/date/bound1', lowerBound, current, upperBound)

  return (
    <div className="rbc-toolbar">
      <span className="rbc-btn-group">
        {current > lowerBound ? (
          <button type="button" onClick={() => onNavigate("PREV")}>
            &lt;
          </button>
        ) : null}
      </span>
      <span className="rbc-toolbar-label">{label}</span>
      <span className="rbc-btn-group">
        {current < upperBound ? (
          <button type="button" onClick={() => onNavigate("NEXT")}>
            &gt;
          </button>
        ) : null}
      </span>
    </div>
  )
}

// -- PAGE component
export default () => {
  // -- api
  const { getAgenda } = useAPI()
  // -- edition related
  const { timezone } = useTimezone()
  const { currentEdition, currentEditionName } = useEventTime()
  const [displayEdition, setDisplayEdition] = useState({
    label: currentEditionName,
    value: currentEdition,
  })
  const { mainConfMetadata } = useDisplayEdition(displayEdition.value)
  const {
    text: mainConfDateText,
    start: mainConfStartDate,
    end: mainConfEndDate,
    eventTimeBoundary,
    resourceMap,
  } = mainConfMetadata
  const { isLoggedIn } = useFirebaseWrapper()
  // -- local states
  const [isLoading, setIsLoading] = useState(true)
  const [agendaData, setAgendaData] = useState([])
  const [tzAgendaData, setTzAgendaData] = useState([])
  // -- calendar related states
  // this is a moment object, used to fetch data
  const [currentDateToFetch, setCurrentDateToFetch] = useState(null)
  // this is a Date object, used to set calendar date title
  const [currentDateForCalendar, setCurrentDateForCalendar] = useState(null)
  // this is time boundary for each day on the calendar
  const [minTime, setMinTime] = useState(undefined)
  const [maxTime, setMaxTime] = useState(undefined)
  // -- modal states
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [pressedItemData, setPressedItemData] = useState(null)

  // initiate date for both calendar and fetcher
  useEffect(() => {
    if (!eventTimeBoundary) {
      return
    }

    const tzStartDate = moment.tz(mainConfStartDate, "MMMM DD, YYYY", timezone)
    tzStartDate.set("h", 0)
    tzStartDate.set("m", 0)

    setCurrentDateForCalendar(new Date(tzStartDate.toISOString()))
    setCurrentDateToFetch(tzStartDate)
  }, [eventTimeBoundary, mainConfStartDate, timezone])

  // fetch data in this effect
  useEffect(() => {
    if (!currentDateToFetch) {
      return
    }

    setIsLoading(true)
    getAgenda({
      edition: displayEdition.value,
      starttime: encodeURIComponent(currentDateToFetch.toISOString()),
    })
      .then(res => res.json())
      .then(resJson => {
        setAgendaData(resJson.data)
        setIsLoading(false)
      })
      .catch(err => {
        setIsLoading(false)
        console.log(err)
      })
  }, [currentDateToFetch, displayEdition.value, getAgenda, timezone])

  // handle fetched data by adding timezone into each object
  useEffect(() => {
    const { converted, minT, maxT } = handleConvertDatetime(
      agendaData,
      timezone
    )

    setTzAgendaData(converted)

    if (minT || maxT) {
      setMinTime(minT)
      setMaxTime(maxT)
    } else {
      const tzEndDate = moment.tz(mainConfEndDate, "MMMM DD, YYYY", timezone)
      tzEndDate.set("h", 0)
      tzEndDate.set("m", 0)
      setMinTime(new Date(tzEndDate.toISOString()))
      tzEndDate.set("m", 1)
      setMaxTime(new Date(tzEndDate.toISOString()))
    }
  }, [agendaData, mainConfEndDate, timezone])

  // useEffect(() => {
  //   console.log("tzAgendaData", tzAgendaData)
  // }, [tzAgendaData])

  return (
    <Layout>
      <AbstractModal
        data={pressedItemData}
        visible={detailModalVisible}
        handleClickClose={() => setDetailModalVisible(false)}
        timezone={timezone}
      />
      <CommonPageStyles>
        <HeadingWithButtonContainer>
          <h2>Agenda</h2>
          <TimezoneEditionModal
            editionValue={displayEdition}
            onEditionChange={edition => {
              setDisplayEdition(edition)
            }}
          />
        </HeadingWithButtonContainer>
        <p>
          This is a demo page for agenda. You can click the gear icon on the
          top-right corner to see previouse Neuromatch Conference agenda. The
          main conference will be happening on{" "}
          <BoldText>{mainConfDateText}</BoldText>.
        </p>
        <ul>
          <li>
            <b>Usage</b>
            {" · "}
            Please select timezone based on your location or preferred timezone
            in the top-right corner. The time on agenda will be updated
            according to your chosen location. You can click each event to
            access event details and <Fa icon={["far", "calendar-plus"]} />
            {" to add to Google calendar. "}
            When you expand, you will also see links to Crowdcast (
            <Fa icon="chalkboard-teacher" />
            ). There are one stage and parallel rooms.{" "}
            <b>
              If you change the timezone, please change the date to refresh this
              calendar view.
            </b>{" "}
          </li>
          <li>
            <b>More Details</b>
            {" · "}
            We also provide search engine, personal schedule, and recommendation
            engine on our{" "}
            <Link to="/abstract-browser">Abstract Browser page</Link>.
          </li>
        </ul>
        {isLoading && isLoggedIn !== false ? (
          <NoticeBox>
            Now loading... <Fa icon="sync" spin />
          </NoticeBox>
        ) : isLoggedIn === false ? (
          <p
            css={`
              text-align: center;
              border: 2px solid rgb(248, 42, 96);
              padding: 12px 0;
            `}
          >
            Please register and log-in to view the agenda
          </p>
        ) : null}
        {tzAgendaData.length === 0 && !isLoading ? (
          <>
            {/* <NoticeBox>
              There are no events on this day <Fa icon="bullhorn" />
            </NoticeBox> */}
            <NoticeBox>
              Agenda coming soon! <Fa icon="bullhorn" />
            </NoticeBox>
          </>
        ) : null}
        {currentDateForCalendar && tzAgendaData.length !== 0 && !isLoading ? (
          <BigCalendarContainer>
            <Calendar
              localizer={localizer}
              events={tzAgendaData}
              defaultView={Views.DAY}
              views={["day"]}
              step={5}
              timeslots={2}
              date={currentDateForCalendar}
              resources={resourceMap}
              resourceAccessor="track"
              resourceIdAccessor="track"
              resourceTitleAccessor="resourceTitle"
              eventPropGetter={event => ({
                style: {
                  borderLeftWidth: "4px",
                  borderLeftColor: getColorOfTalkFormat(event.talk_format),
                },
              })}
              onNavigate={date => {
                const tzDate = moment.tz(date, timezone)
                tzDate.set("h", 0)
                tzDate.set("m", 0)

                setCurrentDateForCalendar(date)
                setCurrentDateToFetch(tzDate)
              }}
              components={{
                toolbar: CustomBar(eventTimeBoundary),
              }}
              min={minTime}
              max={maxTime}
              onSelectEvent={selectedEvent => {
                setDetailModalVisible(true)
                setPressedItemData(selectedEvent)
              }}
            />
          </BigCalendarContainer>
        ) : null}
      </CommonPageStyles>
    </Layout>
  )
}
