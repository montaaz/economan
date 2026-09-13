/** Requête partagée par l'économat et l'administration. */
export const DAY_BOARD_QUERY = /* GraphQL */ `
  query DayBoard($day: Date) {
    dayBoard(day: $day) {
      day
      orderCount
      lineCount
      totalAsked
      totalServed
      pendingCount
      departments {
        department { id name code color icon }
        orderCount
        lineCount
        totalAsked
        totalServed
        orders {
          id
          reference
          ticketNumber
          status
          createdAt
          lineCount
          totalAsked
          totalServed
          createdBy { fullName }
        }
      }
    }
    activeDays(limit: 30)
  }
`

export const ORDER_QUERY = /* GraphQL */ `
  query Order($id: ID!) {
    order(id: $id) {
      id
      reference
      ticketNumber
      businessDay
      status
      note
      createdAt
      acceptedAt
      deliveredAt
      receivedAt
      lineCount
      totalAsked
      totalServed
      department { id name code color icon }
      createdBy { fullName }
      processedBy { fullName }
      lines {
        id
        productId
        productName
        productRef
        categoryName
        unitSymbol
        quantityAsked
        quantityServed
        status
        rejectReason
      }
    }
  }
`
